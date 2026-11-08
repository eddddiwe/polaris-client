package dev.polaris.chat;

import java.io.IOException;
import java.net.ConnectException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.net.http.WebSocket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * Transport and state shared by every Minecraft version. Runs its own daemon
 * threads and never touches game classes.
 */
public final class PolarisChat {
    public static final String BASE = "https://polaris-api.joykelows17.workers.dev";
    private static final Duration HTTP_TIMEOUT = Duration.ofSeconds(10);
    private static final long BACKOFF_BASE_MS = 3000L;
    private static final long BACKOFF_MAX_MS = 60_000L;
    private static final long TYPING_WINDOW_MS = 3500L;
    private static final int MAX_THREAD = 200;

    // Must come after the constants above; the constructor uses HTTP_TIMEOUT.
    public static final PolarisChat INSTANCE = new PolarisChat();

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(HTTP_TIMEOUT).build();
    private final Map<String, List<ChatMessage>> threads = new ConcurrentHashMap<>();
    private final Map<String, Integer> unread = new ConcurrentHashMap<>();
    private final Map<String, Long> typingUntil = new ConcurrentHashMap<>();
    private final Map<String, Boolean> loading = new ConcurrentHashMap<>();
    private final Map<String, Long> lastTypingSent = new ConcurrentHashMap<>();
    private final Object backoffLock = new Object();

    private volatile boolean running;
    private volatile boolean screenOpen;
    private volatile String status = "offline";
    private volatile String error = "";
    private volatile List<Friend> friends = List.of();
    private volatile String selected;
    private volatile String myCode = "";
    private volatile String token = "";
    private volatile MessageSink sink = text -> {
    };
    private volatile WebSocket socket;
    private volatile Thread worker;
    private volatile ScheduledExecutorService heartbeat;
    private volatile ScheduledFuture<?> heartbeatTask;
    private volatile long lastInbound;
    private long wakeSeq; // Guarded by backoffLock; bumped by retry() to cancel a pending wait.

    private PolarisChat() {
    }

    public synchronized void start() {
        if (running) return;
        if (System.getProperty("polaris.chat.demo") != null) {
            installDemo();
            return;
        }
        String code = env("POLARIS_FRIEND_CODE").toUpperCase(Locale.ROOT);
        String key = env("POLARIS_CHAT_TOKEN");
        if (!ChatCodes.isCode(code) || !key.matches("^pc_[0-9a-f-]{36}$")) {
            status = "unavailable";
            return;
        }
        myCode = code;
        token = key;
        running = true;
        status = "connecting";
        error = "";
        Thread thread = new Thread(this::runLoop, "PolarisChat");
        thread.setDaemon(true);
        worker = thread;
        thread.start();
    }

    private void installDemo() {
        myCode = "POLARIS-AB34-CD56";
        status = "live";
        friends = List.of(
                new Friend("POLARIS-ZX89-QW23", "Nova", "", 0),
                new Friend("POLARIS-KL55-MN78", "Riven", "", 0),
                new Friend("POLARIS-PP23-RS77", "Mika", "", 0));
        long base = System.currentTimeMillis() - 3_600_000L;
        merge("POLARIS-ZX89-QW23", List.of(
                new ChatMessage("a1111111-1111-4111-8111-111111111111", "POLARIS-ZX89-QW23", "POLARIS-AB34-CD56", "Nova", "hey, are we still testing the shader pack tonight?", base - 3_600_000L),
                new ChatMessage("a1111111-1111-4111-8111-111111111112", "POLARIS-AB34-CD56", "POLARIS-ZX89-QW23", "Alex", "Yeah. I grabbed the 1.21.10 build so we match.", base - 3_540_000L),
                new ChatMessage("a1111111-1111-4111-8111-111111111113", "POLARIS-ZX89-QW23", "POLARIS-AB34-CD56", "Nova", "Nice. The launcher chat works without refreshing?\nAnd it is live?", base - 120_000L),
                new ChatMessage("a1111111-1111-4111-8111-111111111114", "POLARIS-AB34-CD56", "POLARIS-ZX89-QW23", "Alex", "Yep, live over a socket. Now from inside the game.", base - 60_000L)));
        unread.put("POLARIS-KL55-MN78", 2);
        selected = "POLARIS-ZX89-QW23";
    }

    public synchronized void stop() {
        running = false;
        Thread thread = worker;
        worker = null;
        if (thread != null) thread.interrupt();
        shutdownHeartbeat();
        closeSocket(true);
        synchronized (backoffLock) {
            backoffLock.notifyAll();
        }
        status = "unavailable".equals(status) ? status : "offline";
    }

    public void setSink(MessageSink sink) {
        this.sink = sink == null ? text -> {
        } : sink;
    }

    public void setScreenOpen(boolean open) {
        screenOpen = open;
        if (open && selected != null) unread.remove(selected);
    }

    public String status() {
        return status;
    }

    public String error() {
        return error;
    }

    public String myCode() {
        return myCode;
    }

    public String selected() {
        return selected;
    }

    public List<Friend> friends() {
        return friends;
    }

    public List<ChatMessage> thread(String code) {
        if (code == null) return List.of();
        List<ChatMessage> messages = threads.get(code);
        // merge() only stores immutable snapshots, so the UI can share them
        // across frames instead of copying the list on every read.
        return messages == null ? List.of() : messages;
    }

    public int unread(String code) {
        return code == null ? 0 : unread.getOrDefault(code, 0);
    }

    public int totalUnread() {
        int total = 0;
        for (int value : unread.values()) total += value;
        return total;
    }

    public boolean isLoading(String code) {
        return code != null && loading.containsKey(code);
    }

    public String typingName(String code) {
        if (code == null) return null;
        Long until = typingUntil.get(code);
        if (until == null || until <= System.currentTimeMillis()) return null;
        for (Friend friend : friends) {
            if (friend.code().equals(code)) return friend.name();
        }
        return code;
    }

    public void select(String code) {
        if (!ChatCodes.isCode(code)) return;
        selected = code;
        unread.remove(code);
        typingUntil.remove(code);
        error = "";
        loadHistory(code);
    }

    public void send(String text) {
        String code = selected;
        String clean = text == null ? "" : text.trim();
        if (code == null || clean.isEmpty()) return;
        if (clean.length() > ChatCodes.MAX_TEXT) clean = clean.substring(0, ChatCodes.MAX_TEXT);
        String message = clean;
        Thread thread = new Thread(() -> sendNow(code, message), "PolarisChatSend");
        thread.setDaemon(true);
        thread.start();
    }

    public void typing() {
        String code = selected;
        if (code == null) return;
        long now = System.currentTimeMillis();
        Long last = lastTypingSent.get(code);
        if (last != null && now - last < 2500L) return;
        lastTypingSent.put(code, now);
        Thread thread = new Thread(() -> {
            try {
                call("POST", "/v1/chat/typing", Map.of("friendCode", code));
            } catch (Exception ignored) {
                // Typing is best effort.
            }
        }, "PolarisChatTyping");
        thread.setDaemon(true);
        thread.start();
    }

    public void refresh() {
        Thread thread = new Thread(() -> {
            refreshFriends();
            String code = selected;
            if (code != null) loadHistory(code);
        }, "PolarisChatRefresh");
        thread.setDaemon(true);
        thread.start();
    }

    public void retry() {
        WebSocket ws = socket;
        if (ws != null) {
            try {
                ws.abort();
            } catch (Exception ignored) {
                // Already closed.
            }
        }
        synchronized (backoffLock) {
            wakeSeq++;
            backoffLock.notifyAll();
        }
    }

    // ---------------------------------------------------------------- transport

    private void runLoop() {
        int attempt = 0;
        while (running) {
            long wake;
            synchronized (backoffLock) {
                wake = wakeSeq;
            }
            long connectedAt = 0;
            try {
                status = "connecting";
                String ticket = requestTicket();
                if (!running) break;
                CountDownLatch closed = new CountDownLatch(1);
                Listener listener = new Listener(closed);
                WebSocket ws = http.newWebSocketBuilder()
                        .connectTimeout(HTTP_TIMEOUT)
                        .buildAsync(URI.create(webSocketUrl(ticket)), listener)
                        .get(15, TimeUnit.SECONDS);
                socket = ws;
                status = "live";
                error = "";
                connectedAt = System.currentTimeMillis();
                lastInbound = connectedAt;
                refreshFriends();
                String code = selected;
                if (code != null) loadHistory(code);
                startHeartbeat(ws);
                closed.await();
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                break;
            } catch (Exception failure) {
                error = ChatCodes.plain(friendly(failure));
            } finally {
                stopHeartbeat();
                closeSocket(false);
                if (connectedAt > 0 && System.currentTimeMillis() - connectedAt >= 10_000L) {
                    attempt = 0;
                }
            }
            if (!running) break;
            status = "offline";
            long delay = backoff(attempt);
            attempt = Math.min(attempt + 1, 5);
            synchronized (backoffLock) {
                long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(delay);
                try {
                    while (running && wakeSeq == wake) {
                        long remaining = deadline - System.nanoTime();
                        if (remaining <= 0L) break;
                        TimeUnit.NANOSECONDS.timedWait(backoffLock, remaining);
                    }
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }
        if (!"unavailable".equals(status)) status = "offline";
        shutdownHeartbeat();
    }

    private String requestTicket() throws IOException, InterruptedException {
        HttpResponse<String> response = call("POST", "/v1/chat/ticket", null);
        if (response.statusCode() == 401 || response.statusCode() == 403) {
            status = "unavailable";
            error = "Chat session expired. Restart Minecraft from Polaris.";
            running = false;
            throw new IOException("Chat credentials were rejected");
        }
        if (response.statusCode() != 200) {
            throw new IOException("Chat ticket failed (" + response.statusCode() + ")");
        }
        String ticket = Json.string(Json.object(Json.parse(response.body())).get("ticket"), "");
        if (ticket.isEmpty()) throw new IOException("Chat ticket was missing");
        return ticket;
    }

    private HttpResponse<String> call(String method, String path, Object body)
            throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(BASE + path))
                .timeout(HTTP_TIMEOUT)
                .header("Accept", "application/json")
                .header("X-Polaris-Chat-Token", token);
        if (body == null) {
            builder.method(method, HttpRequest.BodyPublishers.noBody());
        } else {
            builder.header("Content-Type", "application/json")
                    .method(method, HttpRequest.BodyPublishers.ofString(Json.stringify(body), StandardCharsets.UTF_8));
        }
        return http.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    }

    private String webSocketUrl(String ticket) {
        return BASE.replaceFirst("^https://", "wss://") + "/v1/chat/ws?ticket="
                + URLEncoder.encode(ticket, StandardCharsets.UTF_8);
    }

    private void refreshFriends() {
        try {
            HttpResponse<String> response = call("GET", "/v1/chat/friends", null);
            if (response.statusCode() != 200 || !running) return;
            List<Friend> list = new ArrayList<>();
            for (Object item : Json.array(Json.object(Json.parse(response.body())).get("friends"))) {
                Friend friend = Friend.from(item);
                if (friend != null) list.add(friend);
            }
            list.sort(Comparator.comparing(Friend::name, String.CASE_INSENSITIVE_ORDER));
            friends = List.copyOf(list);
        } catch (Exception ignored) {
            // Keep the previous list when the network hiccups.
        }
    }

    private void loadHistory(String code) {
        if (loading.putIfAbsent(code, Boolean.TRUE) != null) return;
        Thread thread = new Thread(() -> {
            try {
                HttpResponse<String> response = call(
                        "GET", "/v1/chat/history?friendCode=" + URLEncoder.encode(code, StandardCharsets.UTF_8), null);
                if (response.statusCode() != 200) {
                    error = "Could not load messages (" + response.statusCode() + ").";
                    return;
                }
                List<ChatMessage> fetched = new ArrayList<>();
                for (Object item : Json.array(Json.object(Json.parse(response.body())).get("messages"))) {
                    ChatMessage message = ChatMessage.from(item);
                    if (message != null) fetched.add(message);
                }
                merge(code, fetched);
            } catch (Exception failure) {
                error = ChatCodes.plain(friendly(failure));
            } finally {
                loading.remove(code);
            }
        }, "PolarisChatHistory");
        thread.setDaemon(true);
        thread.start();
    }

    private void sendNow(String code, String text) {
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("friendCode", code);
            body.put("text", text);
            HttpResponse<String> response = call("POST", "/v1/chat/send", body);
            if (response.statusCode() != 200) {
                String detail = "Could not send message (" + response.statusCode() + ").";
                try {
                    detail = Json.string(Json.object(Json.parse(response.body())).get("error"), detail);
                } catch (Exception ignored) {
                    // A proxy or edge error page is not JSON.
                }
                error = ChatCodes.plain(detail);
                return;
            }
            Map<String, Object> root = Json.object(Json.parse(response.body()));
            ChatMessage sent = ChatMessage.from(root.get("message"));
            if (sent != null) receive(sent);
            error = "";
        } catch (Exception failure) {
            error = ChatCodes.plain(friendly(failure));
        }
    }

    private void startHeartbeat(WebSocket ws) {
        stopHeartbeat();
        ScheduledExecutorService executor = heartbeat;
        if (executor == null || executor.isShutdown()) {
            executor = Executors.newSingleThreadScheduledExecutor(runnable -> {
                Thread thread = new Thread(runnable, "PolarisChatPing");
                thread.setDaemon(true);
                return thread;
            });
            heartbeat = executor;
        }
        // Reuse one daemon timer across reconnects; pin the task to this socket so a
        // cancelled-but-running tick can never abort a newer connection.
        heartbeatTask = executor.scheduleAtFixedRate(() -> {
            if (System.currentTimeMillis() - lastInbound > 60_000L) {
                ws.abort();
                return;
            }
            try {
                ws.sendText("{\"type\":\"ping\"}", true).whenComplete((ignored, failure) -> {
                    if (failure != null) ws.abort();
                });
            } catch (Exception failure) {
                ws.abort();
            }
        }, 20, 20, TimeUnit.SECONDS);
    }

    private void stopHeartbeat() {
        ScheduledFuture<?> task = heartbeatTask;
        heartbeatTask = null;
        if (task != null) task.cancel(false);
    }

    private void shutdownHeartbeat() {
        stopHeartbeat();
        ScheduledExecutorService executor = heartbeat;
        heartbeat = null;
        if (executor != null) executor.shutdownNow();
    }

    private void closeSocket(boolean abort) {
        WebSocket ws = socket;
        socket = null;
        if (ws == null) return;
        try {
            if (abort) {
                ws.abort();
            } else {
                ws.sendClose(WebSocket.NORMAL_CLOSURE, "closing").exceptionally(failure -> {
                    ws.abort();
                    return null;
                });
            }
        } catch (Exception ignored) {
            // Already closed.
        }
    }

    private void receive(ChatMessage message) {
        String peer = message.from().equals(myCode) ? message.to() : message.from();
        merge(peer, List.of(message));
        if (!message.from().equals(myCode)) {
            if (!screenOpen) {
                sink.system("[Polaris] " + message.fromName() + ": " + ChatCodes.oneLine(message.text()));
                unread.merge(peer, 1, Integer::sum);
            } else if (!peer.equals(selected)) {
                unread.merge(peer, 1, Integer::sum);
            }
        }
        resortFriends();
    }

    private void merge(String code, List<ChatMessage> fetched) {
        if (fetched.isEmpty()) return;
        threads.compute(code, (key, existing) -> {
            if (existing == null) existing = List.of();
            if (fetched.size() == 1) {
                ChatMessage message = fetched.get(0);
                if (existing.isEmpty() || appends(existing, message)) {
                    return appendCapped(existing, message);
                }
            }
            Map<String, ChatMessage> byId = new LinkedHashMap<>(
                    Math.max(16, existing.size() + fetched.size()));
            for (ChatMessage message : existing) byId.put(message.id(), message);
            for (ChatMessage message : fetched) byId.put(message.id(), message);
            List<ChatMessage> merged = new ArrayList<>(byId.values());
            merged.sort(Comparator.comparingLong(ChatMessage::createdAt));
            int overflow = merged.size() - MAX_THREAD;
            if (overflow > 0) merged.subList(0, overflow).clear();
            return List.copyOf(merged);
        });
    }

    /** True when one live message can be appended without dedupe or a full sort. */
    private static boolean appends(List<ChatMessage> existing, ChatMessage message) {
        if (message.createdAt() < existing.get(existing.size() - 1).createdAt()) return false;
        for (int i = existing.size() - 1; i >= 0; i--) {
            if (existing.get(i).id().equals(message.id())) return false;
        }
        return true;
    }

    private static List<ChatMessage> appendCapped(List<ChatMessage> existing, ChatMessage message) {
        int size = existing.size();
        int from = Math.max(0, size + 1 - MAX_THREAD);
        List<ChatMessage> merged = new ArrayList<>(size + 1 - from);
        merged.addAll(existing.subList(from, size));
        merged.add(message);
        return List.copyOf(merged);
    }

    private void resortFriends() {
        List<Friend> list = new ArrayList<>(friends);
        list.sort((a, b) -> {
            long left = lastAt(a.code());
            long right = lastAt(b.code());
            if (left != right) return Long.compare(right, left);
            return a.name().compareToIgnoreCase(b.name());
        });
        friends = List.copyOf(list);
    }

    private long lastAt(String code) {
        List<ChatMessage> messages = threads.get(code);
        if (messages == null || messages.isEmpty()) return 0;
        return messages.get(messages.size() - 1).createdAt();
    }

    private static long backoff(int attempt) {
        long base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS << Math.min(attempt, 5));
        return Math.round(base * (0.8 + Math.random() * 0.4));
    }

    private static String friendly(Exception failure) {
        if (failure instanceof HttpTimeoutException) return "Polaris chat timed out.";
        if (failure instanceof ConnectException) return "Could not reach Polaris chat.";
        String message = failure.getMessage();
        return message == null || message.isBlank() ? "Polaris chat is offline." : message;
    }

    private static String env(String name) {
        String value = System.getenv(name);
        return value == null ? "" : value.trim();
    }

    private final class Listener implements WebSocket.Listener {
        private final CountDownLatch closed;
        private final StringBuilder buffer = new StringBuilder();

        Listener(CountDownLatch closed) {
            this.closed = closed;
        }

        @Override
        public void onOpen(WebSocket webSocket) {
            webSocket.request(1);
        }

        @Override
        public java.util.concurrent.CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            buffer.append(data);
            if (last) {
                String frame = buffer.toString();
                buffer.setLength(0);
                handleFrame(frame);
            }
            webSocket.request(1);
            return null;
        }

        @Override
        public java.util.concurrent.CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
            closed.countDown();
            return null;
        }

        @Override
        public void onError(WebSocket webSocket, Throwable failure) {
            closed.countDown();
        }
    }

    private void handleFrame(String frame) {
        lastInbound = System.currentTimeMillis();
        try {
            Map<String, Object> root = Json.object(Json.parse(frame));
            String type = Json.string(root.get("type"), "");
            if ("message".equals(type)) {
                ChatMessage message = ChatMessage.from(root.get("message"));
                if (message != null) receive(message);
            } else if ("typing".equals(type)) {
                String from = Json.string(root.get("from"), "").toUpperCase(Locale.ROOT);
                if (ChatCodes.isCode(from)) {
                    typingUntil.put(from, System.currentTimeMillis() + TYPING_WINDOW_MS);
                }
            }
        } catch (Exception ignored) {
            // Ignore malformed frames.
        }
    }
}
