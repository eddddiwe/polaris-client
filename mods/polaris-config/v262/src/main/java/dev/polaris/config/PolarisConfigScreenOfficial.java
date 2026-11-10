/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraft.client.gui.Font
 *  net.minecraft.client.gui.GuiGraphicsExtractor
 *  net.minecraft.client.gui.screens.Screen
 *  net.minecraft.client.input.MouseButtonEvent
 *  net.minecraft.network.chat.Component
 */
package dev.polaris.config;

import dev.polaris.config.PolarisConfigSettings;
import dev.polaris.config.PolarisConfigUi;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

public class PolarisConfigScreenOfficial
extends Screen {
    private final PolarisConfigSettings settings = PolarisConfigSettings.load();
    private final long openedAt;
    private int category;

    public PolarisConfigScreenOfficial() {
        super((Component)Component.literal((String)"PolarisConfig"));
        this.category = this.settings.rememberLastPage ? this.settings.category : 0;
        this.openedAt = System.currentTimeMillis();
    }

    public void extractRenderState(final GuiGraphicsExtractor guiGraphicsExtractor, int n, int n2, float f) {
        final Font font = this.font;
        PolarisConfigUi.Paint paint = new PolarisConfigUi.Paint(){

            @Override
            public void fill(int n, int n2, int n3, int n4, int n5) {
                guiGraphicsExtractor.fill(n, n2, n3, n4, n5);
            }

            @Override
            public void text(String string, int n, int n2, int n3) {
                guiGraphicsExtractor.text(font, string, n, n2, n3);
            }

            @Override
            public void centered(String string, int n, int n2, int n3) {
                guiGraphicsExtractor.centeredText(font, string, n, n2, n3);
            }

            @Override
            public int textWidth(String string) {
                return font.width(string);
            }

            @Override
            public void flat(String string, int n, int n2, int n3) {
                guiGraphicsExtractor.text(font, string, n, n2, n3, false);
            }

            @Override
            public void flatCentered(String string, int n, int n2, int n3) {
                this.flat(string, n - font.width(string) / 2, n2, n3);
            }
        };
        PolarisConfigUi.render(paint, this.settings, this.category, n, n2, this.width, this.height, this.openedAt);
    }

    public boolean mouseClicked(MouseButtonEvent mouseButtonEvent, boolean bl) {
        if (bl || mouseButtonEvent.button() != 0) {
            return false;
        }
        int n = this.category;
        PolarisConfigUi.ClickResult clickResult = PolarisConfigUi.click(this.settings, this.category, mouseButtonEvent.x(), mouseButtonEvent.y(), this.width, this.height);
        this.category = clickResult.category;
        if (clickResult.close) {
            this.onClose();
            return true;
        }
        return clickResult.changed || this.category != n;
    }

    public boolean isPauseScreen() {
        return this.settings.pauseGame;
    }
}

