package com.interaktik.cubo;

import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandManager;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.KeyMapping;
import net.minecraft.world.item.BlockItem;
import org.lwjgl.glfw.GLFW;

import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Parte del cliente: abre el menu visual del Cubo Gigante con la tecla K (se puede cambiar en Controles)
 * o con el comando /cubomenu. El menu manda los mismos comandos /cubo que se escribirian en el chat.
 */
public final class CuboClient implements ClientModInitializer {

    private static KeyMapping menuKey;
    private static boolean openRequested;

    /** Colocacion instantanea: sin la pausa de Minecraft entre un bloque y el siguiente al mantener el clic derecho. */
    private static boolean instantPlace = true;

    static boolean instantPlace() { return instantPlace; }

    static void setInstantPlace(boolean value) {
        instantPlace = value;
        try {
            Files.writeString(settingsFile(), "instantPlace=" + value + System.lineSeparator());
        } catch (Exception e) {
            CuboMod.LOGGER.warn("No se pudo guardar la opcion de colocacion instantanea: {}", e.toString());
        }
    }

    private static Path settingsFile() {
        return FabricLoader.getInstance().getConfigDir().resolve("interaktik_cubo_cliente.properties");
    }

    private static void loadSettings() {
        try {
            Path file = settingsFile();
            if (Files.exists(file)) instantPlace = !Files.readString(file).contains("instantPlace=false");
        } catch (Exception e) {
            // se queda el valor por defecto
        }
    }

    @Override
    public void onInitializeClient() {
        loadSettings();
        menuKey = KeyBindingHelper.registerKeyBinding(new KeyMapping(
                "key.interaktik_cubo.menu", InputConstants.Type.KEYSYM, GLFW.GLFW_KEY_K, "key.categories.interaktik_cubo"));

        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            // sin pausa entre bloques: con un bloque en la mano, el siguiente se puede colocar en el tick que sigue
            if (instantPlace && client.player != null && client.screen == null
                    && client.player.getMainHandItem().getItem() instanceof BlockItem) {
                client.rightClickDelay = 0;
            }
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
