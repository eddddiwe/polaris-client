package dev.polaris.chat;

/** Lets the version adapter print a Polaris message into the vanilla chat HUD. */
public interface MessageSink {
    void system(String text);
}
