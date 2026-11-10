/*
 * Decompiled with CFR 0.152.
 */
package dev.polaris.config;

import dev.polaris.config.PolarisBadges;
import dev.polaris.config.PolarisConfigSettings;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public final class PolarisPresence {
    private static final String WORKER = "https://polaris-api.joykelows17.workers.dev";
    private static final String CODE_ENV = "POLARIS_FRIEND_CODE";
    private static final String SECRET_ENV = "POLARIS_FRIEND_SECRET";
    private static final Set<String> known = ConcurrentHashMap.newKeySet();
    private static String knownServer = "";
    private static Class<?> textClass;
    private static Method literalMethod;

    private PolarisPresence() {
    }

    public static boolean isKnown(String string) {
        return string != null && known.contains(string.toLowerCase(Locale.ROOT));
    }

    public static void start() {
        Thread thread = new Thread(new Runnable(){

            @Override
            public void run() {
                while (true) {
                    try {
                        Object object = PolarisPresence.client();
                        if (object != null) {
                            PolarisPresence.tick(object);
                        }
                    }
                    catch (Throwable throwable) {
                        // empty catch block
                    }
                    try {
                        Thread.sleep(20000L);
                    }
                    catch (InterruptedException interruptedException) {
                        Thread.currentThread().interrupt();
                        return;
                    }
                }
            }
        }, "PolarisConfig-Presence");
        thread.setDaemon(true);
        thread.start();
    }

    private static void tick(Object object) {
        PolarisConfigSettings polarisConfigSettings = PolarisConfigSettings.load();
        if (!polarisConfigSettings.presenceAlerts) {
            if (!known.isEmpty() || !knownServer.isEmpty()) {
                known.clear();
                knownServer = "";
                PolarisBadges.applyAsync(object, Set.of());
            }
            return;
        }
        try {
            String string = PolarisPresence.currentServer(object);
            if (string == null) {
                if (!known.isEmpty() || !knownServer.isEmpty()) {
                    known.clear();
                    knownServer = "";
                    PolarisBadges.applyAsync(object, Set.of());
                }
                return;
            }
            String[] stringArray = PolarisPresence.identity(object);
            if (stringArray == null) {
                return;
            }
            String string2 = System.getenv(CODE_ENV);
            String string3 = System.getenv(SECRET_ENV);
            if (string2 == null || string2.isEmpty() || string3 == null || string3.isEmpty()) {
                return;
            }
            PolarisPresence.postPresence(string, stringArray[0], stringArray[1], string2, string3);
            List<String> list = PolarisPresence.fetchPresence(string, string2, string3);
            LinkedHashSet<String> linkedHashSet = new LinkedHashSet<String>();
            for (String string4 : list) {
                int n = string4.indexOf(124);
                if (n <= 0) continue;
                String string5 = string4.substring(0, n);
                linkedHashSet.add(string5);
            }
            if (!string.equals(knownServer)) {
                knownServer = string;
                synchronized (known) {
                    known.clear();
                }
                PolarisBadges.applyAsync(object, Set.of());
            }
            synchronized (known) {
                known.clear();
                known.addAll(linkedHashSet);
            }
            Set<String> snapshot;
            synchronized (known) {
                snapshot = Set.copyOf(known);
            }
            PolarisBadges.applyAsync(object, snapshot);
        }
        catch (Throwable throwable) {
            // empty catch block
        }
    }

    static Object client() throws Exception {
        try {
            Class<?> clazz = Class.forName("net.minecraft.class_310");
            try {
                return clazz.getMethod("method_1551", new Class[0]).invoke(null, new Object[0]);
            }
            catch (NoSuchMethodException noSuchMethodException) {
            }
        }
        catch (ClassNotFoundException classNotFoundException) {
            Class<?> clazz = Class.forName("net.minecraft.client.Minecraft");
            try {
                return clazz.getMethod("getInstance", new Class[0]).invoke(null, new Object[0]);
            }
            catch (NoSuchMethodException noSuchMethodException) {
                // empty catch block
            }
        }
        return null;
    }

    private static String currentServer(Object object) throws Exception {
        Method method = PolarisPresence.findMethod(object.getClass(), null, "ServerData", "class_642");
        if (method == null) {
            return null;
        }
        Object object2 = method.invoke(object, new Object[0]);
        if (object2 == null) {
            return null;
        }
        String string = null;
        for (Field field : PolarisPresence.allFields(object2.getClass())) {
            String string2;
            if (field.getType() != String.class) continue;
            field.setAccessible(true);
            Object object3 = field.get(object2);
            if (!(object3 instanceof String) || !(string2 = ((String)object3).trim()).contains(".") && !string2.contains(":")) continue;
            string = string2;
            break;
        }
        if (string == null) {
            string = PolarisPresence.stringField(object2, "ip", "address", "field_3761", "field_3752");
        }
        if (string == null) {
            return null;
        }
        if ((string = string.trim().toLowerCase(Locale.ROOT)).isEmpty() || string.startsWith("localhost") || string.startsWith("127.0.0.1")) {
            return null;
        }
        return string;
    }

    private static String[] identity(Object object) throws Exception {
        Object object2;
        Object object3;
        Object object4;
        String string = null;
        try {
            object4 = PolarisPresence.findMethod(object.getClass(), null, "User", "class_320");
            if (object4 != null && (object3 = ((Method)object4).invoke(object, new Object[0])) != null && (object2 = PolarisPresence.stringValue(object3, "getName", "name", "field_1982")) instanceof String) {
                string = (String)object2;
            }
        }
        catch (Throwable throwable) {
            // empty catch block
        }
        object4 = PolarisPresence.fieldValue(object, "field_1724");
        if (object4 == null) {
            object4 = PolarisPresence.fieldValue(object, "player");
        }
        if (object4 != null) {
            object3 = PolarisPresence.invokeNoArg(object4, "method_5667");
            if (!(object3 instanceof UUID)) {
                object3 = PolarisPresence.invokeNoArg(object4, "getUUID");
            }
            if (object3 instanceof UUID) {
                if (string == null || string.isEmpty()) {
                    object2 = PolarisPresence.invokeNoArg(object4, "method_5477");
                    if (object2 == null) {
                        object2 = PolarisPresence.invokeNoArg(object4, "getName");
                    }
                    string = PolarisPresence.textString(object2, object3.toString());
                }
                return new String[]{object3.toString(), string};
            }
        }
        if ((object3 = PolarisPresence.findMethod(object.getClass(), null, "User", "class_320")) == null) {
            return null;
        }
        object2 = ((Method)object3).invoke(object, new Object[0]);
        if (object2 == null) {
            return null;
        }
        UUID uUID = PolarisPresence.uuidValue(object2);
        if (uUID == null) {
            return null;
        }
        return new String[]{uUID.toString(), string == null || string.isEmpty() ? uUID.toString() : string};
    }

    private static String textString(Object object, String string) {
        if (object == null) {
            return string;
        }
        try {
            Object object2 = object.getClass().getMethod("getString", new Class[0]).invoke(object, new Object[0]);
            if (object2 instanceof String) {
                return (String)object2;
            }
        }
        catch (Throwable throwable) {
            // empty catch block
        }
        return string;
    }

    private static UUID uuidValue(Object object) throws Exception {
        Object object3;
        try {
            object3 = object.getClass().getMethod("getProfileId", new Class[0]);
            Object object22 = ((Method)object3).invoke(object, new Object[0]);
            if (object22 instanceof UUID) {
                return (UUID)object22;
            }
        }
        catch (NoSuchMethodException noSuchMethodException) {
            // empty catch block
        }
        try {
            object3 = object.getClass().getMethod("method_44717", new Class[0]);
            Object object2 = ((Method)object3).invoke(object, new Object[0]);
            if (object2 instanceof UUID) {
                return (UUID)object2;
            }
        }
        catch (NoSuchMethodException noSuchMethodException) {
            // empty catch block
        }
        for (Field field : PolarisPresence.allFields(object.getClass())) {
            if (field.getType() != UUID.class) continue;
            field.setAccessible(true);
            Object object4 = field.get(object);
            if (!(object4 instanceof UUID)) continue;
            return (UUID)object4;
        }
        return null;
    }

    private static String stringValue(Object object, String ... stringArray) throws Exception {
        for (String string : stringArray) {
            try {
                Method method = object.getClass().getMethod(string, new Class[0]);
                Object object2 = method.invoke(object, new Object[0]);
                if (!(object2 instanceof String) || ((String)object2).isEmpty()) continue;
                return (String)object2;
            }
            catch (NoSuchMethodException noSuchMethodException) {
                // empty catch block
            }
        }
        return PolarisPresence.stringField(object, stringArray);
    }

    private static String stringField(Object object, String ... stringArray) throws Exception {
        for (String string : stringArray) {
            Field field = PolarisPresence.findField(object.getClass(), string);
            if (field == null || field.getType() != String.class) continue;
            field.setAccessible(true);
            Object object2 = field.get(object);
            if (!(object2 instanceof String) || ((String)object2).isEmpty()) continue;
            return (String)object2;
        }
        for (Field field : PolarisPresence.allFields(object.getClass())) {
            if (field.getType() != String.class) continue;
            field.setAccessible(true);
            Object object3 = field.get(object);
            if (!(object3 instanceof String) || !((String)object3).contains(".")) continue;
            return (String)object3;
        }
        return null;
    }

    private static void postPresence(String string, String string2, String string3, String string4, String string5) throws Exception {
        String string6 = "{\"uuid\":\"" + PolarisPresence.escape(string2) + "\",\"name\":\"" + PolarisPresence.escape(string3) + "\",\"server\":\"" + PolarisPresence.escape(string) + "\"}";
        HttpURLConnection httpURLConnection = (HttpURLConnection)new URL("https://polaris-api.joykelows17.workers.dev/v1/presence").openConnection();
        httpURLConnection.setInstanceFollowRedirects(false);
        httpURLConnection.setRequestMethod("POST");
        httpURLConnection.setConnectTimeout(4000);
        httpURLConnection.setReadTimeout(4000);
        httpURLConnection.setDoOutput(true);
        httpURLConnection.setRequestProperty("Content-Type", "application/json");
        httpURLConnection.setRequestProperty("X-Polaris-Code", string4);
        httpURLConnection.setRequestProperty("X-Polaris-Secret", string5);
        try (OutputStream outputStream = httpURLConnection.getOutputStream();){
            outputStream.write(string6.getBytes(StandardCharsets.UTF_8));
        }
        httpURLConnection.getResponseCode();
        httpURLConnection.disconnect();
    }

    private static List<String> fetchPresence(String string, String string2, String string3) throws Exception {
        String string4 = "https://polaris-api.joykelows17.workers.dev/v1/presence?format=text&server=" + URLEncoder.encode(string, "UTF-8");
        HttpURLConnection httpURLConnection = (HttpURLConnection)new URL(string4).openConnection();
        httpURLConnection.setInstanceFollowRedirects(false);
        httpURLConnection.setRequestMethod("GET");
        httpURLConnection.setConnectTimeout(4000);
        httpURLConnection.setReadTimeout(4000);
        httpURLConnection.setRequestProperty("Accept", "text/plain");
        httpURLConnection.setRequestProperty("X-Polaris-Code", string2);
        httpURLConnection.setRequestProperty("X-Polaris-Secret", string3);
        ArrayList<String> arrayList = new ArrayList<String>();
        int n = httpURLConnection.getResponseCode();
        if (n >= 200 && n < 300) {
            try (InputStream inputStream = httpURLConnection.getInputStream();
                 BufferedReader bufferedReader = new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8));){
                String string5;
                while ((string5 = bufferedReader.readLine()) != null) {
                    if (string5.trim().isEmpty()) continue;
                    arrayList.add(string5.trim());
                }
            }
        }
        httpURLConnection.disconnect();
        return arrayList;
    }

    private static void chat(final Object object, final String string) {
        try {
            Method method = PolarisPresence.findExecute(object.getClass());
            if (method != null) {
                method.invoke(object, new Runnable(){

                    @Override
                    public void run() {
                        PolarisPresence.addChat(object, string);
                    }
                });
            } else {
                PolarisPresence.addChat(object, string);
            }
        }
        catch (Throwable throwable) {
            // empty catch block
        }
    }

    private static void addChat(Object object, String string) {
        try {
            Object object2 = PolarisPresence.chatComponent(object);
            if (object2 == null) {
                return;
            }
            Object object3 = PolarisPresence.literal(string);
            if (object3 == null) {
                return;
            }
            Method method = null;
            for (Method method2 : object2.getClass().getMethods()) {
                if (method2.getParameterCount() != 1 || !method2.getParameterTypes()[0].isAssignableFrom(object3.getClass()) || method2.getReturnType() != Void.TYPE || !method2.getName().equals("addClientSystemMessage") && !method2.getName().equals("method_1812") && !method2.getName().startsWith("add")) continue;
                method = method2;
                break;
            }
            if (method != null) {
                method.invoke(object2, object3);
            }
        }
        catch (Throwable throwable) {
            // empty catch block
        }
    }

    static Object chatComponent(Object object) throws Exception {
        Object object2;
        Object object3;
        Object object4 = PolarisPresence.fieldValue(object, "gui");
        if (object4 != null && (object3 = PolarisPresence.fieldValue(object4, "hud")) != null) {
            object2 = PolarisPresence.invokeNoArg(object3, "getChat");
            if (object2 != null) {
                return object2;
            }
            object2 = PolarisPresence.fieldValue(object3, "chat");
            if (object2 != null) {
                return object2;
            }
        }
        if ((object3 = PolarisPresence.fieldByType(object, "InGameHud", "class_329")) != null && (object2 = PolarisPresence.findMethod(object3.getClass(), null, "ChatHud", "class_338")) != null) {
            return ((Method)object2).invoke(object3, new Object[0]);
        }
        return null;
    }

    private static Object literal(String string) throws Exception {
        if (literalMethod == null) {
            try {
                textClass = Class.forName("net.minecraft.class_2561");
                literalMethod = textClass.getMethod("method_43470", String.class);
            }
            catch (ClassNotFoundException classNotFoundException) {
                textClass = Class.forName("net.minecraft.network.chat.Component");
                literalMethod = textClass.getMethod("literal", String.class);
            }
        }
        return literalMethod.invoke(null, string);
    }

    static Method findExecute(Class<?> clazz) {
        try {
            return clazz.getMethod("execute", Runnable.class);
        }
        catch (NoSuchMethodException noSuchMethodException) {
            for (Method method : clazz.getMethods()) {
                if (method.getParameterCount() != 1 || method.getReturnType() != Void.TYPE || !method.getParameterTypes()[0].isAssignableFrom(Runnable.class)) continue;
                return method;
            }
            return null;
        }
    }

    private static Object invokeNoArg(Object object, String string) {
        if (object == null) {
            return null;
        }
        try {
            return object.getClass().getMethod(string, new Class[0]).invoke(object, new Object[0]);
        }
        catch (Throwable throwable) {
            return null;
        }
    }

    private static Method findMethod(Class<?> clazz, String string, String ... stringArray) {
        for (Method method : clazz.getMethods()) {
            if (method.getParameterCount() != 0 || string != null && !method.getName().equals(string)) continue;
            String string2 = method.getReturnType().getSimpleName();
            for (String string3 : stringArray) {
                if (!string2.contains(string3)) continue;
                return method;
            }
        }
        return null;
    }

    private static Object fieldValue(Object object, String string) throws Exception {
        Field field = PolarisPresence.findField(object.getClass(), string);
        if (field == null) {
            return null;
        }
        field.setAccessible(true);
        return field.get(object);
    }

    private static Object fieldByType(Object object, String ... stringArray) throws Exception {
        for (Field field : PolarisPresence.allFields(object.getClass())) {
            String string = field.getType().getSimpleName();
            for (String string2 : stringArray) {
                if (!string.contains(string2)) continue;
                field.setAccessible(true);
                return field.get(object);
            }
        }
        return null;
    }

    private static Field findField(Class<?> clazz, String string) {
        for (Field field : PolarisPresence.allFields(clazz)) {
            if (!field.getName().equals(string)) continue;
            return field;
        }
        return null;
    }

    private static List<Field> allFields(Class<?> clazz) {
        ArrayList<Field> arrayList = new ArrayList<Field>();
        for (Class<?> clazz2 = clazz; clazz2 != null; clazz2 = clazz2.getSuperclass()) {
            for (Field field : clazz2.getDeclaredFields()) {
                arrayList.add(field);
            }
        }
        return arrayList;
    }

    private static String escape(String string) {
        return string.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}

