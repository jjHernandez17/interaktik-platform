package com.interaktik.mod;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/** config/interaktik.json: la llave del panel y la direccion de la plataforma. */
final class Config {

    static final String DEFAULT_API_URL = "https://interaktik-platform-production.up.railway.app";

    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    final String apiUrl;
    final String serverKey;

    Config(String apiUrl, String serverKey) {
        this.apiUrl = apiUrl == null || apiUrl.isBlank() ? DEFAULT_API_URL : apiUrl.trim();
        this.serverKey = serverKey == null ? "" : serverKey.trim();
    }

    private static Path file() {
        return FabricLoader.getInstance().getConfigDir().resolve("interaktik.json");
    }

    static Config load() {
        try {
            Path path = file();
            if (Files.exists(path)) {
                Config raw = GSON.fromJson(Files.readString(path, StandardCharsets.UTF_8), Config.class);
                if (raw != null) return new Config(raw.apiUrl, raw.serverKey);
            }
        } catch (Exception exception) {
            InteraktikMod.LOGGER.warn("No se pudo leer config/interaktik.json: {}", exception.toString());
        }
        return new Config(DEFAULT_API_URL, "");
    }

    static void save(Config config) {
        try {
            Files.createDirectories(file().getParent());
            Files.writeString(file(), GSON.toJson(config), StandardCharsets.UTF_8);
        } catch (IOException exception) {
            InteraktikMod.LOGGER.warn("No se pudo guardar config/interaktik.json: {}", exception.toString());
        }
    }

    /** https://x -> wss://x/mc-bridge/<llave>?edition=java */
    String bridgeUri() {
        String base = apiUrl.replaceAll("/+$", "");
        String ws = base.replaceFirst("^http", "ws");
        return ws + "/mc-bridge/" + serverKey + "?edition=java";
    }
}
