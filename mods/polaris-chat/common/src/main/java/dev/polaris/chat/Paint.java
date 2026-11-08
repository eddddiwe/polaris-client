package dev.polaris.chat;

/** Minimal drawing surface implemented by each Minecraft version adapter. */
public interface Paint {
    void fill(int x1, int y1, int x2, int y2, int color);

    void text(String text, int x, int y, int color);

    int width(String text);

    default void centered(String text, int centerX, int y, int color) {
        text(text, centerX - width(text) / 2, y, color);
    }

    /** Restricts drawing to a rectangle. Adapters implement this with the game's scissor. */
    default void clip(int x1, int y1, int x2, int y2) {
    }

    default void unclip() {
    }
}
