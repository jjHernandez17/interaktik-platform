package com.interaktik.minecraft;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.entity.TNTPrimed;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityExplodeEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Interaktik — Minecraft interactivo.
 *
 * Consulta cada segundo la cola de acciones de la plataforma (los regalos de TikTok Live) con la
 * llave secreta del usuario y las ejecuta sobre el jugador configurado en el panel.
 *
 * Las acciones solo se piden cuando el streamer esta dentro del servidor (online=1): asi no se pierden
 * si esta desconectado, quedan pendientes en la plataforma.
 */
public final class InteraktikPlugin extends JavaPlugin implements Listener {

    private HttpClient http;
    private ActionExecutor executor;

    private BukkitTask presenceTask;
    private BukkitTask pollTask;

    /** Nombre del jugador configurado en la plataforma (lo devuelve la cola). */
    private volatile String streamerName;
    /** Se actualiza en el hilo principal; el hilo de red solo lo lee. */
    private volatile boolean streamerOnline;

    private volatile String lastError = "";
    private final AtomicLong lastErrorLogAt = new AtomicLong(0);
    private volatile long lastPollOkAt = 0;
    private volatile int totalActions = 0;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
        executor = new ActionExecutor(this);

        getServer().getPluginManager().registerEvents(this, this);
        startTasks();

        getLogger().info("Interaktik listo. Configura tu llave en plugins/Interaktik/config.yml.");
    }

    @Override
    public void onDisable() {
        stopTasks();
    }

    private void startTasks() {
        stopTasks();

        int seconds = Math.max(1, Math.min(10, getConfig().getInt("poll-seconds", 1)));

        // Hilo principal: mantiene "streamerOnline" para que el hilo de red no toque la API de Bukkit.
        presenceTask = Bukkit.getScheduler().runTaskTimer(this, () -> {
            String name = streamerName;
            streamerOnline = name != null && !name.isBlank() && Bukkit.getPlayerExact(name) != null;
        }, 20L, 20L);

        pollTask = Bukkit.getScheduler().runTaskTimerAsynchronously(this, this::poll, 40L, seconds * 20L);
    }

    private void stopTasks() {
        if (presenceTask != null) presenceTask.cancel();
        if (pollTask != null) pollTask.cancel();
        presenceTask = null;
        pollTask = null;
    }

    // ----------------------------------------------------------------------------------- consulta

    private void poll() {
        String key = getConfig().getString("server-key", "").trim();
        if (key.isEmpty()) {
            reportProblem("Falta la llave: pégala en plugins/Interaktik/config.yml (campo server-key).");
            return;
        }

        String apiUrl = getConfig().getString("api-url", "").trim();
        while (apiUrl.endsWith("/")) apiUrl = apiUrl.substring(0, apiUrl.length() - 1);

        try {
            String url = apiUrl + "/api/minecraft/queue?key=" + URLEncoder.encode(key, StandardCharsets.UTF_8)
                    + "&online=" + (streamerOnline ? "1" : "0");

            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(8))
                    .header("Accept", "application/json")
                    .GET()
                    .build();

            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 404) {
                reportProblem("La llave no es válida. Cópiala de nuevo desde el panel de Minecraft.");
                return;
            }
            if (response.statusCode() == 403) {
                reportProblem("Tu prueba o plan de Interaktik venció.");
                return;
            }
            if (response.statusCode() != 200) {
                reportProblem("La plataforma respondió HTTP " + response.statusCode() + ".");
                return;
            }

            lastError = "";
            lastPollOkAt = System.currentTimeMillis();

            JsonObject body = JsonParser.parseString(response.body()).getAsJsonObject();
            JsonElement player = body.get("player");
            streamerName = player != null && !player.isJsonNull() ? player.getAsString() : null;

            JsonArray items = body.has("items") && body.get("items").isJsonArray()
                    ? body.getAsJsonArray("items") : new JsonArray();

            if (items.size() > 0) {
                List<ActionExecutor.Item> parsed = new ArrayList<>();
                for (JsonElement element : items) {
                    JsonObject item = element.getAsJsonObject();
                    parsed.add(new ActionExecutor.Item(
                            item.has("tiktok_nickname") ? item.get("tiktok_nickname").getAsString() : "Alguien",
                            item.get("action").getAsString(),
                            item.get("amount").getAsInt()));
                }

                // La API de Bukkit solo se toca en el hilo principal
                Bukkit.getScheduler().runTask(this, () -> {
                    Player target = streamerName == null ? null : Bukkit.getPlayerExact(streamerName);
                    for (ActionExecutor.Item item : parsed) {
                        if (target == null || !target.isOnline()) break;
                        try {
                            executor.run(target, item);
                            totalActions++;
                        } catch (Exception exception) {
                            getLogger().warning("No se pudo ejecutar '" + item.action() + "': " + exception);
                        }
                    }
                });
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        } catch (Exception exception) {
            reportProblem("No se pudo consultar la plataforma: " + exception.getClass().getSimpleName()
                    + (exception.getMessage() != null ? " (" + exception.getMessage() + ")" : ""));
        }
    }

    /** Evita llenar la consola: el mismo problema se avisa al inicio y luego una vez por minuto. */
    private void reportProblem(String message) {
        boolean changed = !message.equals(lastError);
        lastError = message;
        long now = System.currentTimeMillis();
        if (changed || now - lastErrorLogAt.get() > 60_000) {
            lastErrorLogAt.set(now);
            getLogger().warning(message);
        }
    }

    // ----------------------------------------------------------------------------------- eventos

    /** El TNT de los regalos no rompe bloques (a menos que se active en el config). */
    @EventHandler
    public void onExplode(EntityExplodeEvent event) {
        if (event.getEntity() instanceof TNTPrimed tnt
                && tnt.hasMetadata(ActionExecutor.TNT_METADATA)
                && !getConfig().getBoolean("tnt-destroys-blocks", false)) {
            event.blockList().clear();
        }
    }

    // ----------------------------------------------------------------------------------- comandos

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        String sub = args.length == 0 ? "status" : args[0].toLowerCase(Locale.ROOT);

        switch (sub) {
            case "reload" -> {
                reloadConfig();
                startTasks();
                sender.sendMessage("§a[Interaktik] Configuración recargada.");
            }
            case "status" -> {
                boolean hasKey = !getConfig().getString("server-key", "").isBlank();
                long ago = lastPollOkAt == 0 ? -1 : (System.currentTimeMillis() - lastPollOkAt) / 1000;
                sender.sendMessage("§e[Interaktik] §fLlave: " + (hasKey ? "§aconfigurada" : "§cfalta"));
                sender.sendMessage("§e[Interaktik] §fJugador del streamer: §b" + (streamerName == null ? "(aún no se sabe)" : streamerName)
                        + (streamerOnline ? " §a(en línea)" : " §7(desconectado)"));
                sender.sendMessage("§e[Interaktik] §fÚltima consulta correcta: "
                        + (ago < 0 ? "§cninguna todavía" : "§ahace " + ago + " s"));
                sender.sendMessage("§e[Interaktik] §fAcciones ejecutadas: §b" + totalActions);
                if (!lastError.isEmpty()) sender.sendMessage("§c[Interaktik] Problema: " + lastError);
            }
            case "test" -> {
                if (!(sender instanceof Player player)) {
                    sender.sendMessage("§cEste subcomando lo usa un jugador dentro del juego.");
                    return true;
                }
                if (args.length < 2) {
                    sender.sendMessage("§eUso: /interaktik test <accion> [cantidad]  (acciones: " + String.join(", ", ActionExecutor.ACTIONS) + ")");
                    return true;
                }
                String action = args[1].toLowerCase(Locale.ROOT);
                if (!ActionExecutor.ACTIONS.contains(action)) {
                    sender.sendMessage("§cAcción desconocida: " + action);
                    return true;
                }
                int amount = 1;
                if (args.length >= 3) {
                    try {
                        amount = Math.max(1, Math.min(100, Integer.parseInt(args[2])));
                    } catch (NumberFormatException ignored) {
                        sender.sendMessage("§cLa cantidad debe ser un número.");
                        return true;
                    }
                }
                executor.run(player, new ActionExecutor.Item(player.getName(), action, amount));
            }
            default -> sender.sendMessage("§eUso: /interaktik <reload|status|test>");
        }
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        List<String> options = new ArrayList<>();
        if (args.length == 1) {
            options.addAll(List.of("reload", "status", "test"));
        } else if (args.length == 2 && args[0].equalsIgnoreCase("test")) {
            options.addAll(ActionExecutor.ACTIONS);
        }
        String prefix = args.length == 0 ? "" : args[args.length - 1].toLowerCase(Locale.ROOT);
        options.removeIf(option -> !option.startsWith(prefix));
        return options;
    }
}
