package dev.polaris.chat.v261;

import com.mojang.blaze3d.platform.InputConstants;
import dev.polaris.chat.PolarisChat;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import dev.polaris.chat.Keys;

public final class PolarisChatEntry implements ClientModInitializer {
    private KeyMapping openKey;

    @Override
    public void onInitializeClient() {
        PolarisChat.INSTANCE.setSink(text -> {
            Minecraft client = Minecraft.getInstance();
            client.execute(() -> {
                if (client.player != null && client.gui != null) {
                    client.gui.getChat().addClientSystemMessage(Component.literal(text));
                }
            });
        });
        PolarisChat.INSTANCE.start();

        openKey = KeyMappingHelper.registerKeyMapping(new KeyMapping(
                "key.polarischat.open",
                InputConstants.Type.KEYSYM,
                Keys.F9,
                KeyMapping.Category.MISC
        ));

        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            while (openKey.consumeClick()) {
                if (client.screen == null && client.player != null) {
                    client.setScreen(new PolarisChatScreen());
                }
            }
        });
    }
}
