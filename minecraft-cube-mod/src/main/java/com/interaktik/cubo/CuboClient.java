package com.interaktik.cubo;

import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandManager;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.KeyMapping;
import org.lwjgl.glfw.GLFW;

/**
 * Parte del cliente: abre el menu visual del Cubo Gigante con la tecla K (se puede cambiar en Controles)
 * o con el comando /cubomenu. El menu manda los mismos comandos /cubo que se escribirian en el chat.
 */
public final class CuboClient implements ClientModInitializer {

    private static KeyMapping menuKey;
    private static boolean openRequested;

    @Override
    public void onInitializeClient() {
        menuKey = KeyBindingHelper.registerKeyBinding(new KeyMapping(
                "key.interaktik_cubo.menu", InputConstants.Type.KEYSYM, GLFW.GLFW_KEY_K, "key.categories.interaktik_cubo"));

        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            while (menuKey.consumeClick()) openRequested = true;
            // con el comando, el chat se cierra justo despues de ejecutarlo: el menu se abre cuando ya no hay pantalla
            if (openRequested && client.screen == null && client.player != null) {
                openRequested = false;
                client.setScreen(new CuboScreen());
            }
        });

        ClientCommandRegistrationCallback.EVENT.register((dispatcher, registryAccess) ->
                dispatcher.register(ClientCommandManager.literal("cubomenu").executes(context -> {
                    openRequested = true;
                    return 1;
                })));
    }
}
