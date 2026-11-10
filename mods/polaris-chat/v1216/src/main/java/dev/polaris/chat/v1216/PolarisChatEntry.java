package dev.polaris.chat.v1216;

import dev.polaris.chat.PolarisChat;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.text.Text;
import dev.polaris.chat.Keys;

public final class PolarisChatEntry implements ClientModInitializer {
    private KeyBinding openKey;

    @Override
    public void onInitializeClient() {
        PolarisChat.INSTANCE.setSink(text -> {
            MinecraftClient client = MinecraftClient.getInstance();
            client.execute(() -> {
                if (client.player != null && client.inGameHud != null) {
                    client.inGameHud.getChatHud().addMessage(Text.literal(text));
                }
            });
        });
        PolarisChat.INSTANCE.start();

        openKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
                "key.polarischat.open",
                InputUtil.Type.KEYSYM,
                Keys.F9,
                "category.polarischat"
        ));

        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            while (openKey.wasPressed()) {
                if (client.currentScreen == null && client.player != null) {
                    client.setScreen(new PolarisChatScreen());
                }
            }
        });
    }
}
