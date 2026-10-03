package com.interaktik.mod;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.server.MinecraftServer;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.time.Duration;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Cliente WebSocket hacia la plataforma. Recibe mensajes {@code commandRequest} y ejecuta
 * {@code body.commandLine} en el hilo del servidor con permisos de operador. Si se cae la conexion
 * reintenta sola cada pocos segundos (salvo que la llave sea invalida, se haya regenerado o la
 * haya reemplazado otra conexion).
 */
final class BridgeClient {

    private static final int RETRY_SECONDS = 5;

    private final Config config;
    private final MinecraftServer server;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "interaktik-bridge");
        thread.setDaemon(true);
        return thread;
    });
    private final AtomicInteger executed = new AtomicInteger();

    private volatile WebSocket socket;
    private volatile boolean stopped;
    private volatile boolean connected;
    private volatile String problem = "";

    BridgeClient(Config config, MinecraftServer server) {
        this.config = config;
        this.server = server;
    }

    void start() {
        stopped = false;
        scheduler.execute(this::open);
    }

    void stop() {
        stopped = true;
        connected = false;
        WebSocket current = socket;
        if (current != null) {
            current.sendClose(WebSocket.NORMAL_CLOSURE, "adios");
        }
        scheduler.shutdownNow();
    }

    boolean isConnected() {
        return connected;
    }

    int executed() {
        return executed.get();
    }

    String lastProblem() {
        return problem;
    }

    private void open() {
        if (stopped) return;

        http.newWebSocketBuilder()
                .connectTimeout(Duration.ofSeconds(8))
                .buildAsync(URI.create(config.bridgeUri()), new Listener())
                .whenComplete((webSocket, error) -> {
                    if (error != null) {
                        connected = false;
                        problem = "no se pudo conectar con la plataforma (" + error.getClass().getSimpleName() + ")";
                        scheduleRetry();
                    }
                });
    }

    private void scheduleRetry() {
        if (stopped) return;
        try {
            scheduler.schedule(this::open, RETRY_SECONDS, TimeUnit.SECONDS);
        } catch (Exception ignored) {
            // el planificador ya se cerro
        }
    }

    private void runCommand(String commandLine) {
        // Los comandos se ejecutan en el hilo principal del servidor, como operador y sin eco en el chat
        server.execute(() -> {
            try {
                CommandSourceStack source = server.createCommandSourceStack().withSuppressedOutput();
                server.getCommands().performPrefixedCommand(source, commandLine);
                executed.incrementAndGet();
            } catch (Exception exception) {
                InteraktikMod.LOGGER.warn("No se pudo ejecutar '{}': {}", commandLine, exception.toString());
            }
        });
    }

    private final class Listener implements WebSocket.Listener {

        private final StringBuilder buffer = new StringBuilder();

        @Override
        public void onOpen(WebSocket webSocket) {
            socket = webSocket;
            connected = true;
            problem = "";
            InteraktikMod.LOGGER.info("Conectado con Interaktik.");
            webSocket.request(1);
        }

        @Override
        public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            buffer.append(data);
            if (last) {
                String text = buffer.toString();
                buffer.setLength(0);
                try {
                    JsonObject message = JsonParser.parseString(text).getAsJsonObject();
                    JsonObject header = message.getAsJsonObject("header");
                    if (header != null && "commandRequest".equals(header.get("messagePurpose").getAsString())) {
                        String commandLine = message.getAsJsonObject("body").get("commandLine").getAsString();
                        runCommand(commandLine);
                    }
                } catch (Exception exception) {
                    InteraktikMod.LOGGER.warn("Mensaje ignorado: {}", exception.toString());
                }
            }
            webSocket.request(1);
            return null;
        }

        @Override
        public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
            connected = false;
            switch (statusCode) {
                case 4004 -> {
                    problem = "la llave no es válida";
                    stopped = true;
                }
                case 4003 -> {
                    problem = "tu prueba o plan de Interaktik venció";
                    stopped = true;
                }
                case 4001 -> {
                    problem = "la llave se regeneró: usa /interaktik conectar con la nueva";
                    stopped = true;
                }
                case 4000 -> {
                    problem = "otra conexión tomó tu lugar";
                    stopped = true;
                }
                default -> {
                    problem = "conexión cerrada (" + statusCode + ")";
                    scheduleRetry();
                }
            }
            InteraktikMod.LOGGER.info("Desconectado de Interaktik: {}", problem);
            return null;
        }

        @Override
        public void onError(WebSocket webSocket, Throwable error) {
            connected = false;
            problem = "error de conexión (" + error.getClass().getSimpleName() + ")";
            scheduleRetry();
        }
    }
}
