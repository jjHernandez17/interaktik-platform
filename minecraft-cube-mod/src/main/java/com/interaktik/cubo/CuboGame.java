package com.interaktik.cubo;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.game.ClientboundSetSubtitleTextPacket;
import net.minecraft.network.protocol.game.ClientboundSetTitleTextPacket;
import net.minecraft.network.protocol.game.ClientboundSetTitlesAnimationPacket;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerBossEvent;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.BossEvent;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.item.PrimedTnt;
import net.minecraft.world.entity.LightningBolt;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.LevelResource;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;

/**
 * Logica del juego: cubos gigantes de vidrio (suelo y cuatro paredes, sin techo) que se van llenando de bloques,
 * capa por capa. Al llenar uno se suma una victoria, se celebra, se vacia y empieza otro. Puede haber cualquier
 * cantidad de cubos a la vez en el mundo.
 *
 * Las medidas son las del cubo COMPLETO, vidrio incluido: un cubo de 10x10x10 mide 10 bloques por lado y se llena
 * por dentro (8 de ancho, 9 de alto —el suelo ocupa la primera capa— y 8 de largo).
 *
 * El estado se guarda dentro de cada mundo (interaktik_cubo.json en la carpeta del mundo): al borrar o crear
 * otro mundo se empieza limpio.
 *
 * Todo ocurre en el hilo del servidor. Los bloques se colocan por ticks (no de golpe) para que una rafa de
 * regalos no congele el juego.
 */
final class CuboGame {

    static final int MIN_WIDTH = 3;
    static final int MIN_HEIGHT = 2;
    static final int MIN_LENGTH = 3;
    static final int MAX_SIDE = 100;
    static final int MAX_BLOCKS = 400_000;
    static final int MAX_CUBES = 50;
    private static final int PLACE_PER_TICK = 2_000;
    private static final int CLEAR_PER_TICK = 4_000;
    private static final int CELEBRATE_TICKS = 80;
    private static final int MAX_PENDING = 2_000_000;
    private static final int GAP = 4;
    private static final int SCAN_BUDGET = 6_000;   // posiciones del interior revisadas por tick entre todos los cubos
    private static final int PLACE_SCAN_LIMIT = 20_000;
    private static final int REPAIR_BUDGET = 3_000; // bloques de vidrio revisados por tick entre todos los cubos
    static final int MAX_COUNTDOWN = 3_600;
    static final int MAX_WINS = 1_000_000;

    private static final Block[] RAINBOW = {
            Blocks.WHITE_CONCRETE, Blocks.YELLOW_CONCRETE, Blocks.ORANGE_CONCRETE, Blocks.RED_CONCRETE,
            Blocks.PINK_CONCRETE, Blocks.MAGENTA_CONCRETE, Blocks.PURPLE_CONCRETE, Blocks.BLUE_CONCRETE,
            Blocks.LIGHT_BLUE_CONCRETE, Blocks.CYAN_CONCRETE, Blocks.LIME_CONCRETE, Blocks.GREEN_CONCRETE,
    };

    private enum Phase { FILLING, COUNTDOWN, CELEBRATING, CLEARING }

    private enum After { BUILD, RESTART, REMOVE }

    static final class Cube {
        int id;
        String dimension = "minecraft:overworld";
        int ox, oy, oz;             // esquina minima de la caja COMPLETA; oy es el piso (el bloque bajo los pies del jugador)
        int w = 10, h = 10, l = 10; // medidas de la caja completa
        int filled = 0;
        String block = "";          // "" = arcoiris por capas

        transient Phase phase = Phase.FILLING;
        transient After after = After.BUILD;
        transient int pending = 0;
        transient int clearIdx = 0;
        transient int celebrate = 0;
        transient int countdownLeft = 0;  // ticks que faltan para sumar la victoria
        transient int countdownTotal = 0;
        transient int repairIdx = 0;      // por donde va la revision del vidrio
        transient int pendingTnt = 0;     // TNT por soltar
        transient final List<Integer> lightning = new ArrayList<>(); // rayos por caer (fuerza de cada uno)
        transient int lightningCooldown = 0;
        transient int scanIdx = 0;        // por donde va el barrido que cuenta los bloques puestos
        transient int scanAir = 0;        // huecos vacios encontrados en el barrido actual
        transient int placeCursor = 0;    // por donde va la colocacion automatica (/cubo agregar)

        int innerW() { return w - 2; }
        int innerH() { return h - 1; }
        int innerL() { return l - 2; }
        int total() { return innerW() * innerH() * innerL(); }
    }

    /** Lo que se guarda en la carpeta del mundo */
    static final class Data {
        // medidas y material de los PROXIMOS cubos (los que elige el usuario con comandos)
        int width = 10;
        int height = 10;
        int length = 10;
        String block = "";
        int wins = 0;
        int goal = 10;       // objetivo de wins (admite negativos)
        int countdown = 10;  // segundos de cuenta regresiva al llenar un cubo
        int nextId = 1;
        int selected = 0;
        List<Cube> cubes = new ArrayList<>();
    }

    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    private final MinecraftServer server;
    private final Path file;
    private final Data data;
    private final ServerBossEvent winsBar = new ServerBossEvent(Component.literal("Wins"), BossEvent.BossBarColor.PURPLE, BossEvent.BossBarOverlay.NOTCHED_10);
    private int tick = 0;
    private final List<PrimedTnt> fallingTnt = new ArrayList<>(); // TNT soltados por el mod que aun no explotan
    private boolean dirty = false;

    CuboGame(MinecraftServer server) {
        this.server = server;
        this.file = server.getWorldPath(LevelResource.ROOT).resolve("interaktik_cubo.json");
        this.data = load();
    }

    // ------------------------------------------------------------------ consulta

    Data data() { return data; }

    List<Cube> cubes() { return data.cubes; }

    Cube find(int id) {
        for (Cube cube : data.cubes) if (cube.id == id) return cube;
        return null;
    }

    /** El cubo seleccionado (el ultimo creado, salvo que se elija otro). */
    Cube selected() {
        Cube cube = find(data.selected);
        if (cube == null && !data.cubes.isEmpty()) cube = data.cubes.get(data.cubes.size() - 1);
        return cube;
    }

    static boolean busy(Cube cube) { return cube.phase != Phase.FILLING; }

    // ------------------------------------------------------------------ configuracion

    /** Devuelve un mensaje de error o null si todo bien. */
    String setSize(Integer w, Integer h, Integer l) {
        int nw = w != null ? w : data.width;
        int nh = h != null ? h : data.height;
        int nl = l != null ? l : data.length;
        if (nw < MIN_WIDTH || nl < MIN_LENGTH || nh < MIN_HEIGHT)
            return "Medidas mínimas: ancho " + MIN_WIDTH + ", alto " + MIN_HEIGHT + " y largo " + MIN_LENGTH + " (el vidrio ocupa el borde).";
        if (nw > MAX_SIDE || nh > MAX_SIDE || nl > MAX_SIDE) return "Cada medida puede ser de hasta " + MAX_SIDE + " bloques.";
        long inner = (long) (nw - 2) * (nh - 1) * (nl - 2);
        if (inner > MAX_BLOCKS) return "El interior no puede tener más de " + MAX_BLOCKS + " bloques (con esas medidas serían " + inner + ").";
        data.width = nw; data.height = nh; data.length = nl;
        dirty = true;
        return null;
    }

    /** id de bloque, o "" para arcoiris. Se usa en los cubos nuevos y en el seleccionado. */
    String setBlock(String id) {
        String value = "";
        if (id != null && !id.isEmpty()) {
            ResourceLocation key = ResourceLocation.tryParse(id);
            Optional<Block> block = key == null ? Optional.empty() : BuiltInRegistries.BLOCK.getOptional(key);
            if (block.isEmpty() || block.get() == Blocks.AIR) return "No existe el bloque '" + id + "'.";
            value = key.toString();
        }
        data.block = value;
        Cube cube = selected();
        if (cube != null) cube.block = value;
        dirty = true;
        return null;
    }

    void setWins(int wins) { data.wins = wins; dirty = true; }

    void setGoal(int goal) { data.goal = goal; dirty = true; }

    void setCountdown(int seconds) { data.countdown = Math.max(0, Math.min(MAX_COUNTDOWN, seconds)); dirty = true; }

    void select(Cube cube) { data.selected = cube.id; dirty = true; }

    // ------------------------------------------------------------------ ciclo de vida

    /** Crea un cubo frente al jugador, donde este (aunque vuele). Devuelve el cubo o null y deja el error en out[0]. */
    Cube start(ServerPlayer player, String[] out) {
        if (data.cubes.size() >= MAX_CUBES) { out[0] = "Ya hay " + MAX_CUBES + " cubos; quita alguno con /cubo detener."; return null; }
        BlockPos feet = player.blockPosition();
        Direction dir = player.getDirection();
        int w = data.width, l = data.length;

        int ox;
        int oz;
        if (dir.getAxis() == Direction.Axis.X) {
            ox = dir.getStepX() > 0 ? feet.getX() + GAP : feet.getX() - GAP - w + 1;
            oz = feet.getZ() - l / 2;
        } else {
            oz = dir.getStepZ() > 0 ? feet.getZ() + GAP : feet.getZ() - GAP - l + 1;
            ox = feet.getX() - w / 2;
        }
        // piso a la altura del jugador: el bloque bajo sus pies
        BlockPos origin = new BlockPos(ox, feet.getY() - 1, oz);
        // si ya hay otro cubo ahi, se corre hacia el costado (a la derecha del jugador) hasta que quepa
        Direction side = dir.getClockWise();
        for (int tries = 0; tries < MAX_CUBES && overlaps(player.serverLevel(), origin, w, data.height, l); tries++) {
            int step = (side.getAxis() == Direction.Axis.X ? w : l) + 1;
            origin = origin.relative(side, step);
        }
        return create(player.serverLevel(), origin);
    }

    /** Como startAt, pero si ya hay un cubo ahi lo corre hacia el este hasta que quepa (sin jugador de referencia). */
    Cube startFree(ServerLevel level, BlockPos origin, String[] out) {
        if (data.cubes.size() >= MAX_CUBES) { out[0] = "Ya hay " + MAX_CUBES + " cubos; quita alguno con /cubo detener."; return null; }
        for (int tries = 0; tries < MAX_CUBES && overlaps(level, origin, data.width, data.height, data.length); tries++) {
            origin = origin.relative(Direction.EAST, data.width + 1);
        }
        return create(level, origin);
    }

    /** Crea un cubo con la esquina minima del piso en una posicion dada. */
    Cube startAt(ServerLevel level, BlockPos origin, String[] out) {
        if (data.cubes.size() >= MAX_CUBES) { out[0] = "Ya hay " + MAX_CUBES + " cubos; quita alguno con /cubo detener."; return null; }
        return create(level, origin);
    }

    private Cube create(ServerLevel level, BlockPos origin) {
        Cube cube = new Cube();
        cube.id = data.nextId++;
        cube.dimension = level.dimension().location().toString();
        cube.ox = origin.getX(); cube.oy = origin.getY(); cube.oz = origin.getZ();
        cube.w = data.width; cube.h = data.height; cube.l = data.length;
        cube.block = data.block;
        cube.phase = Phase.CLEARING;
        cube.after = After.BUILD;
        cube.clearIdx = 0;
        data.cubes.add(cube);
        data.selected = cube.id;
        dirty = true;
        return cube;
    }

    private boolean overlaps(ServerLevel level, BlockPos origin, int w, int h, int l) {
        String dim = level.dimension().location().toString();
        for (Cube c : data.cubes) {
            if (!c.dimension.equals(dim)) continue;
            boolean x = origin.getX() < c.ox + c.w && c.ox < origin.getX() + w;
            boolean y = origin.getY() < c.oy + c.h && c.oy < origin.getY() + h;
            boolean z = origin.getZ() < c.oz + c.l && c.oz < origin.getZ() + l;
            if (x && y && z) return true;
        }
        return false;
    }

    /** Vacia el cubo y empieza otro con las mismas medidas. */
    void restart(Cube cube) {
        cube.pending = 0; cube.celebrate = 0; cube.countdownLeft = 0;
        cube.phase = Phase.CLEARING;
        cube.after = After.RESTART;
        cube.clearIdx = 0;
    }

    /** Quita el cubo (bloques y vidrio). */
    void stop(Cube cube) {
        cube.pending = 0; cube.celebrate = 0; cube.countdownLeft = 0;
        cube.phase = Phase.CLEARING;
        cube.after = After.REMOVE;
        cube.clearIdx = 0;
    }

    /** Pide colocar n bloques en un cubo; se colocan en los siguientes ticks. */
    String add(Cube cube, int n) {
        if (n < 1) return "La cantidad debe ser al menos 1.";
        cube.pending = (int) Math.min((long) cube.pending + n, MAX_PENDING);
        return null;
    }

    // ------------------------------------------------------------------ tick

    void tick() {
        tick++;
        for (Cube cube : new ArrayList<>(data.cubes)) {
            ServerLevel level = level(cube);
            if (level == null) continue;
            switch (cube.phase) {
                case CLEARING -> stepClear(cube, level);
                case COUNTDOWN -> {
                    if (cube.countdownLeft > 0 && cube.countdownLeft % 20 == 0) showCountdown(cube.countdownLeft / 20);
                    stepScan(cube, level);
                    if (cube.phase == Phase.COUNTDOWN && --cube.countdownLeft <= 0) win(cube);
                }
                case CELEBRATING -> {
                    if (--cube.celebrate <= 0) { cube.phase = Phase.CLEARING; cube.after = After.RESTART; cube.clearIdx = 0; }
                }
                default -> {
                    if (cube.pending > 0) stepPlace(cube, level);
                    stepScan(cube, level);
                }
            }
        }
        for (Cube cube : new ArrayList<>(data.cubes)) {
            ServerLevel level = level(cube);
            if (level != null && cube.phase != Phase.CLEARING) stepPowers(cube, level);
        }
        watchTnt();
        repairShells();
        if (tick % 10 == 0) updateBars();
        if (dirty && tick % 100 == 0) { save(); dirty = false; }
    }

    // Un hueco "ocupado" es cualquier bloque que no sea aire ni liquido
    private static boolean occupied(BlockState state) {
        return !state.isAir() && state.getFluidState().isEmpty();
    }

    // /cubo agregar (y los regalos): coloca bloques en los huecos vacios, capa por capa, sin pisar lo que el jugador puso
    private void stepPlace(Cube cube, ServerLevel level) {
        int total = cube.total();
        int perLayer = cube.innerW() * cube.innerL();
        int want = Math.min(cube.pending, PLACE_PER_TICK);
        int placed = 0;
        int looked = 0;
        while (placed < want && looked < PLACE_SCAN_LIMIT && looked < total) {
            int idx = cube.placeCursor;
            BlockPos pos = innerPos(cube, idx);
            if (!occupied(level.getBlockState(pos))) {
                level.setBlock(pos, stateFor(cube, idx / perLayer), Block.UPDATE_CLIENTS);
                placed++;
            }
            cube.placeCursor = (idx + 1) % total;
            looked++;
        }
        cube.pending -= placed;
        cube.filled = Math.min(total, cube.filled + placed);
        if (placed == 0 && looked >= total) cube.pending = 0; // no quedan huecos
        dirty = true;
    }

    // Barrido del interior: cuenta los bloques puestos (por el jugador o por /cubo agregar). Si al terminar una vuelta
    // no queda ningun hueco, el cubo esta lleno.
    private void stepScan(Cube cube, ServerLevel level) {
        int total = cube.total();
        int budget = Math.max(500, SCAN_BUDGET / Math.max(1, data.cubes.size()));
        for (int k = 0; k < budget && cube.scanIdx < total; k++) {
            BlockPos pos = innerPos(cube, cube.scanIdx);
            if (!level.hasChunkAt(pos)) return; // chunk descargado: se sigue cuando vuelva a cargarse
            if (!occupied(level.getBlockState(pos))) cube.scanAir++;
            cube.scanIdx++;
        }
        if (cube.scanIdx < total) return;

        int air = cube.scanAir;
        cube.scanIdx = 0;
        cube.scanAir = 0;
        cube.filled = total - air;
        if (cube.phase == Phase.COUNTDOWN) {
            if (air > 0) cancelCountdown(cube); // rompieron un bloque: el cubo ya no esta lleno
        } else if (air == 0) {
            filled(cube);
        }
    }

    private void cancelCountdown(Cube cube) {
        cube.phase = Phase.FILLING;
        cube.countdownLeft = 0;
        broadcastTitle("§c§l¡CUBO INCOMPLETO!", "§fVuelve a llenarlo para reiniciar la cuenta", 0, 40, 10);
    }

    private void broadcastTitle(String title, String subtitle, int in, int stay, int out) {
        Component t = Component.literal(title);
        Component sub = Component.literal(subtitle);
        for (ServerPlayer p : server.getPlayerList().getPlayers()) {
            p.connection.send(new ClientboundSetTitlesAnimationPacket(in, stay, out));
            p.connection.send(new ClientboundSetSubtitleTextPacket(sub));
            p.connection.send(new ClientboundSetTitleTextPacket(t));
        }
    }

    // Numero grande en el centro de la pantalla: se renueva cada segundo
    private void showCountdown(int seconds) {
        broadcastTitle("§e§l" + seconds, "§f¡Cubo lleno! La victoria llega en " + seconds + " s", 0, 25, 5);
    }

    // El cubo se lleno: empieza la cuenta regresiva; al llegar a 0 se suma la victoria
    private void filled(Cube cube) {
        if (data.countdown <= 0) { win(cube); return; }
        cube.phase = Phase.COUNTDOWN;
        cube.countdownTotal = data.countdown * 20;
        cube.countdownLeft = cube.countdownTotal;
        dirty = true;
        cube.scanIdx = 0;
        cube.scanAir = 0;
    }

    private void win(Cube cube) {
        data.wins++;
        cube.phase = Phase.CELEBRATING;
        cube.celebrate = CELEBRATE_TICKS;
        dirty = true;
        save();
        boolean goalReached = data.wins == data.goal;
        Component title = Component.literal(goalReached ? "§d§l¡OBJETIVO DE WINS CUMPLIDO!" : "§6§l+1 WIN");
        Component sub = Component.literal("§e" + data.wins + "/" + data.goal + " wins");
        for (ServerPlayer p : server.getPlayerList().getPlayers()) {
            p.connection.send(new ClientboundSetTitlesAnimationPacket(5, 60, 20));
            p.connection.send(new ClientboundSetTitleTextPacket(title));
            p.connection.send(new ClientboundSetSubtitleTextPacket(sub));
            p.playNotifySound(SoundEvents.UI_TOAST_CHALLENGE_COMPLETE, SoundSource.MASTER, 1.0F, 1.0F);
        }
        server.getPlayerList().broadcastSystemMessage(Component.literal("§6[Cubo #" + cube.id + "] §e¡+1 win! §f" + data.wins + "/" + data.goal + " wins"), false);
    }

    private void stepClear(Cube cube, ServerLevel level) {
        int total = cube.total();
        int end = Math.min(total, cube.clearIdx + CLEAR_PER_TICK);
        BlockState air = Blocks.AIR.defaultBlockState();
        for (int i = cube.clearIdx; i < end; i++) {
            BlockPos pos = innerPos(cube, i);
            if (!level.getBlockState(pos).isAir()) level.setBlock(pos, air, Block.UPDATE_CLIENTS);
        }
        cube.clearIdx = end;
        if (cube.clearIdx < total) return;

        cube.filled = 0;
        cube.phase = Phase.FILLING;
        cube.scanIdx = 0;
        cube.scanAir = 0;
        cube.placeCursor = 0;
        dirty = true;
        if (cube.after == After.REMOVE) {
            removeShell(cube, level);
            data.cubes.remove(cube);
            save();
        } else {
            buildShell(cube, level); // al reiniciar tambien, por si algo del vidrio se rompio
        }
    }

    // ------------------------------------------------------------------ geometria

    /** Posicion del bloque idx dentro del cubo, en orden de llenado (capa por capa, en serpentina). */
    private static BlockPos innerPos(Cube cube, int idx) {
        int iw = cube.innerW();
        int perLayer = iw * cube.innerL();
        int layer = idx / perLayer;
        int r = idx % perLayer;
        int z = r / iw;
        int x = r % iw;
        if ((z & 1) == 1) x = iw - 1 - x; // serpentina: el relleno recorre la capa sin saltos
        return new BlockPos(cube.ox + 1 + x, cube.oy + 1 + layer, cube.oz + 1 + z);
    }

    private BlockState stateFor(Cube cube, int layer) {
        if (!cube.block.isEmpty()) {
            ResourceLocation key = ResourceLocation.tryParse(cube.block);
            if (key != null) {
                Optional<Block> b = BuiltInRegistries.BLOCK.getOptional(key);
                if (b.isPresent()) return b.get().defaultBlockState();
            }
        }
        return RAINBOW[layer % RAINBOW.length].defaultBlockState();
    }

    // Vidrio del cubo: piso completo y cuatro paredes con sus esquinas, sin techo. Se numera para poder
    // recorrerlo de a poco (revision) o completo.
    private static int ringSize(Cube cube) { return 2 * cube.w + 2 * (cube.l - 2); }

    private static int shellCount(Cube cube) { return cube.w * cube.l + (cube.h - 1) * ringSize(cube); }

    private static BlockPos shellPos(Cube cube, int i) {
        int floor = cube.w * cube.l;
        if (i < floor) return new BlockPos(cube.ox + i % cube.w, cube.oy, cube.oz + i / cube.w);
        int j = i - floor;
        int ring = ringSize(cube);
        int y = cube.oy + 1 + j / ring;
        int r = j % ring;
        int x1 = cube.ox + cube.w - 1, z1 = cube.oz + cube.l - 1;
        if (r < cube.w) return new BlockPos(cube.ox + r, y, cube.oz);
        r -= cube.w;
        if (r < cube.w) return new BlockPos(cube.ox + r, y, z1);
        r -= cube.w;
        if (r < cube.l - 2) return new BlockPos(cube.ox, y, cube.oz + 1 + r);
        r -= cube.l - 2;
        return new BlockPos(x1, y, cube.oz + 1 + r);
    }

    private static void forEachShell(Cube cube, Consumer<BlockPos> action) {
        int n = shellCount(cube);
        for (int i = 0; i < n; i++) action.accept(shellPos(cube, i));
    }

    /** true si el bloque es parte del vidrio de algun cubo (piso, paredes o esquinas). */
    boolean isShell(ServerLevel level, BlockPos pos) {
        String dim = level.dimension().location().toString();
        for (Cube c : data.cubes) {
            if (!c.dimension.equals(dim)) continue;
            int x = pos.getX() - c.ox, y = pos.getY() - c.oy, z = pos.getZ() - c.oz;
            if (x < 0 || y < 0 || z < 0 || x >= c.w || y >= c.h || z >= c.l) continue;
            if (y == 0 || x == 0 || z == 0 || x == c.w - 1 || z == c.l - 1) return true;
        }
        return false;
    }

    // Indestructible: si algo rompe el vidrio (explosion, comando, agua...), se repone enseguida. Se revisa de a poco
    // cada tick y solo donde el mundo ya esta cargado.
    private void repairShells() {
        if (data.cubes.isEmpty()) return;
        int budget = Math.max(200, REPAIR_BUDGET / data.cubes.size());
        BlockState glass = Blocks.GLASS.defaultBlockState();
        for (Cube cube : data.cubes) {
            if (cube.phase == Phase.CLEARING) continue;
            ServerLevel level = level(cube);
            if (level == null) continue;
            int n = shellCount(cube);
            for (int k = 0; k < budget && k < n; k++) {
                BlockPos pos = shellPos(cube, cube.repairIdx);
                cube.repairIdx = (cube.repairIdx + 1) % n;
                if (level.hasChunkAt(pos) && !level.getBlockState(pos).is(Blocks.GLASS)) level.setBlock(pos, glass, Block.UPDATE_ALL);
            }
        }
    }

    private void buildShell(Cube cube, ServerLevel level) {
        BlockState glass = Blocks.GLASS.defaultBlockState();
        forEachShell(cube, pos -> level.setBlock(pos, glass, Block.UPDATE_CLIENTS));
    }

    // Quita solo el vidrio del mod; si el piso estaba sobre el suelo, lo repone con tierra para no dejar un hueco
    private void removeShell(Cube cube, ServerLevel level) {
        BlockState air = Blocks.AIR.defaultBlockState();
        BlockState dirt = Blocks.DIRT.defaultBlockState();
        forEachShell(cube, pos -> {
            if (!level.getBlockState(pos).is(Blocks.GLASS)) return;
            boolean floor = pos.getY() == cube.oy;
            BlockState below = level.getBlockState(pos.below());
            boolean solidBelow = floor && !below.isAir() && !below.canBeReplaced();
            level.setBlock(pos, solidBelow ? dirt : air, Block.UPDATE_CLIENTS);
        });
    }


    // ------------------------------------------------------------------ poderes (regalos)

    private static final int TNT_PER_TICK = 3;
    private static final int TNT_DROP_HEIGHT = 24;      // bloques sobre el borde del cubo
    private static final int TNT_FALL_FUSE = 600;       // mecha larga: explota al tocar, no en el aire
    private static final int MAX_POWER_QUEUE = 2_000;
    static final int MAX_LIGHTNING_STRENGTH = 10;

    String addTnt(Cube cube, int n) {
        if (n < 1) return "La cantidad debe ser al menos 1.";
        cube.pendingTnt = Math.min(MAX_POWER_QUEUE, cube.pendingTnt + n);
        return null;
    }

    /** strength 1..10; times = cuantos rayos caen (uno cada pocos ticks). */
    String addLightning(Cube cube, int strength, int times) {
        if (strength < 1 || strength > MAX_LIGHTNING_STRENGTH) return "La fuerza del rayo va de 1 a " + MAX_LIGHTNING_STRENGTH + ".";
        if (times < 1) return "Los rayos deben ser al menos 1.";
        for (int i = 0; i < times && cube.lightning.size() < MAX_POWER_QUEUE; i++) cube.lightning.add(strength);
        return null;
    }

    private void stepPowers(Cube cube, ServerLevel level) {
        // TNT: caen desde arriba del cubo en puntos al azar; la gravedad hace el resto
        for (int i = 0; i < TNT_PER_TICK && cube.pendingTnt > 0; i++) {
            cube.pendingTnt--;
            double x = cube.ox + 1 + level.random.nextDouble() * cube.innerW();
            double z = cube.oz + 1 + level.random.nextDouble() * cube.innerL();
            double y = cube.oy + cube.h + TNT_DROP_HEIGHT + level.random.nextInt(8);
            PrimedTnt tnt = new PrimedTnt(level, x, y, z, null);
            tnt.setDeltaMovement(Vec3.ZERO);
            tnt.setFuse(TNT_FALL_FUSE);
            level.addFreshEntity(tnt);
            fallingTnt.add(tnt);
        }

        // Rayos: uno cada pocos ticks
        if (cube.lightningCooldown > 0) cube.lightningCooldown--;
        if (!cube.lightning.isEmpty() && cube.lightningCooldown == 0) {
            strike(cube, level, cube.lightning.remove(0));
            cube.lightningCooldown = 8;
        }
    }

    // El TNT se enciende justo antes de tocar un bloque (o al apoyarse en uno)
    private void watchTnt() {
        for (int i = fallingTnt.size() - 1; i >= 0; i--) {
            PrimedTnt tnt = fallingTnt.get(i);
            if (tnt.isRemoved() || !(tnt.level() instanceof ServerLevel level)) { fallingTnt.remove(i); continue; }
            Vec3 motion = tnt.getDeltaMovement();
            BlockPos ahead = BlockPos.containing(tnt.getX(), tnt.getY() + Math.min(0.0, motion.y) - 0.3, tnt.getZ());
            if (tnt.onGround() || !level.getBlockState(ahead).isAir()) {
                tnt.setFuse(1);
                fallingTnt.remove(i);
            } else if (tnt.getFuse() < 2) {
                fallingTnt.remove(i);
            }
        }
    }

    // Rayo sobre lo que tiene construido el jugador: cae en una columna con bloques y, segun la fuerza, rompe lo que hay
    // alrededor del impacto (solo dentro del cubo: el vidrio y el terreno no se tocan)
    private void strike(Cube cube, ServerLevel level, int strength) {
        int iw = cube.innerW(), il = cube.innerL(), ih = cube.innerH();
        int baseY = cube.oy + 1;
        BlockPos target = null;
        for (int tries = 0; tries < 40 && target == null; tries++) {
            int x = cube.ox + 1 + level.random.nextInt(iw);
            int z = cube.oz + 1 + level.random.nextInt(il);
            for (int y = baseY + ih - 1; y >= baseY; y--) {
                BlockPos pos = new BlockPos(x, y, z);
                if (occupied(level.getBlockState(pos))) { target = pos; break; }
            }
        }
        if (target == null) {
            // cubo vacio: cae igual, al nivel del piso
            target = new BlockPos(cube.ox + 1 + level.random.nextInt(iw), baseY - 1, cube.oz + 1 + level.random.nextInt(il));
        }

        LightningBolt bolt = EntityType.LIGHTNING_BOLT.create(level, EntitySpawnReason.TRIGGERED);
        if (bolt != null) {
            bolt.moveTo(Vec3.atBottomCenterOf(target.above()));
            bolt.setVisualOnly(true); // el dano al cubo lo hacemos nosotros; asi no incendia ni lastima a nadie
            level.addFreshEntity(bolt);
        }

        double radius = 0.8 + strength * 0.6; // fuerza 1 ~ 1.4 bloques, fuerza 10 ~ 6.8
        int r = (int) Math.ceil(radius);
        BlockState air = Blocks.AIR.defaultBlockState();
        int destroyed = 0;
        for (int dx = -r; dx <= r; dx++) {
            for (int dy = -r; dy <= r; dy++) {
                for (int dz = -r; dz <= r; dz++) {
                    if (dx * dx + dy * dy + dz * dz > radius * radius) continue;
                    BlockPos pos = target.offset(dx, dy, dz);
                    // solo el interior del cubo (lo que relleno el jugador)
                    if (pos.getX() <= cube.ox || pos.getX() >= cube.ox + cube.w - 1) continue;
                    if (pos.getZ() <= cube.oz || pos.getZ() >= cube.oz + cube.l - 1) continue;
                    if (pos.getY() <= cube.oy || pos.getY() >= cube.oy + cube.h) continue;
                    if (!occupied(level.getBlockState(pos))) continue;
                    level.setBlock(pos, air, Block.UPDATE_CLIENTS);
                    destroyed++;
                }
            }
        }
        level.sendParticles(ParticleTypes.EXPLOSION, target.getX() + 0.5, target.getY() + 1.0, target.getZ() + 0.5, Math.min(12, 2 + strength), r * 0.4, r * 0.3, r * 0.4, 0.0);
        if (destroyed > 0) dirty = true;
    }

    // ------------------------------------------------------------------ barras de progreso

    private void updateBars() {
        List<ServerPlayer> players = server.getPlayerList().getPlayers();

        // contador de wins: "3/10 wins" (el objetivo puede ser negativo)
        boolean show = !data.cubes.isEmpty() || data.wins != 0;
        winsBar.setVisible(show);
        winsBar.setName(Component.literal("§e" + data.wins + "/" + data.goal + " §fwins"));
        float ratio = data.goal == 0 ? 0.0F : data.wins / (float) data.goal;
        winsBar.setProgress(Math.max(0.0F, Math.min(1.0F, ratio)));
        for (ServerPlayer p : players) {
            if (!winsBar.getPlayers().contains(p)) winsBar.addPlayer(p);
        }
    }

    // ------------------------------------------------------------------ utilidades

    private ServerLevel level(Cube cube) {
        ResourceLocation id = ResourceLocation.tryParse(cube.dimension);
        if (id == null) return null;
        return server.getLevel(ResourceKey.create(Registries.DIMENSION, id));
    }

    void shutdown() {
        winsBar.removeAllPlayers();
        save();
    }

    // ------------------------------------------------------------------ persistencia (dentro del mundo)

    private Data load() {
        try {
            if (Files.exists(file)) {
                Data raw = GSON.fromJson(Files.readString(file, StandardCharsets.UTF_8), Data.class);
                if (raw != null) {
                    if (raw.block == null) raw.block = "";
                    if (raw.cubes == null) raw.cubes = new ArrayList<>();
                    for (Cube cube : raw.cubes) {
                        if (cube.block == null) cube.block = "";
                        if (cube.dimension == null) cube.dimension = "minecraft:overworld";
                        cube.phase = Phase.FILLING;
                        if (cube.id >= raw.nextId) raw.nextId = cube.id + 1;
                    }
                    return raw;
                }
            }
        } catch (Exception exception) {
            CuboMod.LOGGER.warn("No se pudo leer {}: {}", file, exception.toString());
        }
        return new Data();
    }

    void save() {
        try {
            Files.writeString(file, GSON.toJson(data), StandardCharsets.UTF_8);
        } catch (IOException exception) {
            CuboMod.LOGGER.warn("No se pudo guardar {}: {}", file, exception.toString());
        }
    }
}
