package com.interaktik.mod;

import com.mojang.brigadier.arguments.StringArgumentType;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Interaktik para Minecraft Java (Fabric): conecta tu mundo con la plataforma, sin servidor.
 *
 * Al abrir un mundo (de un jugador, LAN o un servidor Fabric) se conecta por WebSocket a
 * {@code <plataforma>/mc-bridge/<llave>?edition=java}. La plataforma manda ya traducido cada
 * regalo a comandos de Minecraft y el mod solo los ejecuta: asi no hay que actualizarlo cuando
 * se agregan acciones nuevas.
 *
 * Uso: dentro del mundo, una sola vez, {@code /interaktik conectar <llave>} (la llave sale del panel).
 * Queda guardada y en adelante se conecta sola al abrir cualquier mundo.
 */
public final class InteraktikMod implements ModInitializer {

    static final Logger LOGGER = LoggerFactory.getLogger("Interaktik");

    private static volatile MinecraftServer server;
    private static BridgeClient bridge;

    @Override
    public void onInitialize() {
        ServerLifecycleEvents.SERVER_STARTED.register(started -> {
            server = started;
            connectIfConfigured();
        });

        ServerLifecycleEvents.SERVER_STOPPING.register(stopping -> {
            disconnect();
            server = null;
        });

        CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) ->
                dispatcher.register(Commands.literal("interaktik")
                        // Sin nivel de permiso: tiene que servir en mundos de un jugador con trucos desactivados
                        .requires(source -> true)
                        .then(Commands.literal("conectar")
                                .then(Commands.argument("llave", StringArgumentType.word())
                                        .executes(context -> {
                                            String key = StringArgumentType.getString(context, "llave");
                                            return connect(context.getSource(), key);
                                        })))
                        .then(Commands.literal("estado").executes(context -> status(context.getSource())))
                        .then(Commands.literal("desconectar").executes(context -> {
                            disconnect();
                            Config.save(new Config(Config.load().apiUrl, ""));
                            reply(context.getSource(), "§eInteraktik desconectado. Usa /interaktik conectar <llave> para volver a conectar.");
                            return 1;
                        }))
                        .executes(context -> {
                            reply(context.getSource(), "§eUso: /interaktik conectar <llave> | estado | desconectar");
                            return 1;
                        })));
    }

    private static int connect(CommandSourceStack source, String key) {
        if (!key.matches("[A-Fa-f0-9]{32,64}")) {
            reply(source, "§cEsa llave no es válida. Cópiala completa desde el panel de Minecraft de Interaktik.");
            return 0;
        }

        Config previous = Config.load();
        Config.save(new Config(previous.apiUrl, key.toLowerCase()));
        reply(source, "§aConectando con Interaktik... (se conectará sola cada vez que abras un mundo)");
        connectIfConfigured();
        return 1;
    }

    private static int status(CommandSourceStack source) {
        Config config = Config.load();
        if (config.serverKey.isBlank()) {
            reply(source, "§cSin llave. Usa /interaktik conectar <llave> (cópiala del panel).");
        } else if (bridge != null && bridge.isConnected()) {
            reply(source, "§aInteraktik conectado ✔ — comandos ejecutados: " + bridge.executed());
        } else {
            reply(source, "§eInteraktik no está conectado" + (bridge != null && !bridge.lastProblem().isEmpty()
                    ? ": " + bridge.lastProblem() : " (intentando conectar...)"));
        }
        return 1;
    }

    private static void reply(CommandSourceStack source, String message) {
        source.sendSuccess(() -> Component.literal(message), false);
    }

    private static synchronized void connectIfConfigured() {
        MinecraftServer current = server;
        Config config = Config.load();
        if (current == null || config.serverKey.isBlank()) return;

        if (bridge != null) bridge.stop();
        bridge = new BridgeClient(config, current);
        bridge.start();
    }

    private static synchronized void disconnect() {
        if (bridge != null) {
            bridge.stop();
            bridge = null;
        }
    }
}
