package com.interaktik.cubo;

import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.event.player.PlayerBlockBreakEvents;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.arguments.ResourceLocationArgument;
import net.minecraft.commands.arguments.coordinates.BlockPosArgument;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;

/**
 * Cubo Gigante (Fabric 1.21.4): se llenan cubos enormes de vidrio con bloques; cada cubo completo es +1 victoria.
 * Puede haber cualquier cantidad de cubos a la vez. El estado se guarda dentro de cada mundo.
 *
 * Comandos (no piden permisos de operador, igual que el mod de Interaktik):
 *   /cubo tamano <ancho> <alto> <largo>     CREA un cubo con esas medidas (del cubo completo), en un solo comando
 *   /cubo ancho|alto|largo <n>              cambia solo una medida
 *   /cubo iniciar [x y z]                   crea un cubo nuevo donde esta el jugador (o con su piso en esa posicion)
 *   /cubo agregar [cantidad] [id|todos]     coloca bloques en el cubo seleccionado, en el que indiques o en todos
 *   /cubo tnt <cantidad> [id|todos]         suelta TNT desde arriba del cubo (explota al tocar un bloque)
 *   /cubo vacio <capas> [id|todos]          bomba de vacio: quita las capas de arriba que haya construido
 *   /cubo rayo <fuerza 1-10> [veces] [id|todos]  rayo sobre lo construido; la fuerza decide cuanto rompe
 *   /cubo seleccionar <id> | lista          elige a que cubo van los bloques por defecto / ver los cubos
 *   /cubo bloque arcoiris | <bloque>        material de relleno
 *   /cubo reiniciar | detener [id|todos]    vaciar y empezar de nuevo / quitar el cubo
 *   /cubo contador <segundos>               cuenta regresiva al llenar un cubo; al llegar a 0 se suma 1 win
 *   /cubo objetivo <n>                      objetivo de wins (admite negativos); el marcador se ve asi: 3/10 wins
 *   /cubo victorias [poner <n>] | estado [id]
 */
public final class CuboMod implements ModInitializer {

    static final Logger LOGGER = LoggerFactory.getLogger("InteraktikCubo");

    private static CuboGame game;

    /** El juego del mundo abierto (solo hay uno cuando el servidor corre en este mismo proceso). */
    static CuboGame game() { return game; }

    @Override
    public void onInitialize() {
        ServerLifecycleEvents.SERVER_STARTED.register(server -> game = new CuboGame(server));
        ServerLifecycleEvents.SERVER_STOPPING.register(server -> {
            if (game != null) game.shutdown();
            game = null;
        });
        ServerTickEvents.END_SERVER_TICK.register(server -> {
            if (game != null) game.tick();
        });

        // El vidrio del cubo (piso, paredes y esquinas) no se rompe, ni en creativo; lo que rellena el jugador si
        PlayerBlockBreakEvents.BEFORE.register((world, player, pos, state, blockEntity) -> {
            if (game != null && world instanceof ServerLevel level && game.isShell(level, pos)) {
                player.displayClientMessage(Component.literal("§eEl vidrio del cubo es indestructible"), true);
                return false;
            }
            return true;
        });

        CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> {
            LiteralArgumentBuilder<CommandSourceStack> root = Commands.literal("cubo").requires(source -> true);

            root.then(Commands.literal("tamano")
                    .then(Commands.argument("ancho", IntegerArgumentType.integer(1, CuboGame.MAX_SIDE))
                            .then(Commands.argument("alto", IntegerArgumentType.integer(1, CuboGame.MAX_SIDE))
                                    .then(Commands.argument("largo", IntegerArgumentType.integer(1, CuboGame.MAX_SIDE))
                                            .executes(c -> size(c.getSource(),
                                                    IntegerArgumentType.getInteger(c, "ancho"),
                                                    IntegerArgumentType.getInteger(c, "alto"),
                                                    IntegerArgumentType.getInteger(c, "largo")))))));

            root.then(sideCommand("ancho", 0));
            root.then(sideCommand("alto", 1));
            root.then(sideCommand("altura", 1));
            root.then(sideCommand("largo", 2));

            root.then(Commands.literal("iniciar")
                    .executes(c -> start(c.getSource()))
                    .then(Commands.argument("posicion", BlockPosArgument.blockPos())
                            .executes(c -> {
                                if (game == null) return fail(c.getSource(), "Mundo no listo.");
                                String[] error = new String[1];
                                CuboGame.Cube cube = game.startAt(c.getSource().getLevel(), BlockPosArgument.getBlockPos(c, "posicion"), error);
                                if (cube == null) return fail(c.getSource(), error[0]);
                                return created(c.getSource(), cube);
                            })));

            root.then(Commands.literal("agregar")
                    .executes(c -> add(c.getSource(), 1, null))
                    .then(Commands.argument("cantidad", IntegerArgumentType.integer(1, 1_000_000))
                            .executes(c -> add(c.getSource(), IntegerArgumentType.getInteger(c, "cantidad"), null))
                            .then(Commands.literal("todos")
                                    .executes(c -> add(c.getSource(), IntegerArgumentType.getInteger(c, "cantidad"), "todos")))
                            .then(Commands.argument("id", IntegerArgumentType.integer(1))
                                    .executes(c -> add(c.getSource(), IntegerArgumentType.getInteger(c, "cantidad"),
                                            String.valueOf(IntegerArgumentType.getInteger(c, "id")))))));

            // poderes de los regalos
            root.then(Commands.literal("tnt")
                    .then(Commands.argument("cantidad", IntegerArgumentType.integer(1, 2000))
                            .executes(c -> tnt(c.getSource(), IntegerArgumentType.getInteger(c, "cantidad"), null))
                            .then(Commands.literal("todos").executes(c -> tnt(c.getSource(), IntegerArgumentType.getInteger(c, "cantidad"), "todos")))
                            .then(Commands.argument("id", IntegerArgumentType.integer(1))
                                    .executes(c -> tnt(c.getSource(), IntegerArgumentType.getInteger(c, "cantidad"), String.valueOf(IntegerArgumentType.getInteger(c, "id")))))));

            root.then(Commands.literal("vacio")
                    .then(Commands.argument("capas", IntegerArgumentType.integer(1, CuboGame.MAX_VACUUM_LAYERS))
                            .executes(c -> vacuum(c.getSource(), IntegerArgumentType.getInteger(c, "capas"), null))
                            .then(Commands.literal("todos").executes(c -> vacuum(c.getSource(), IntegerArgumentType.getInteger(c, "capas"), "todos")))
                            .then(Commands.argument("id", IntegerArgumentType.integer(1))
                                    .executes(c -> vacuum(c.getSource(), IntegerArgumentType.getInteger(c, "capas"), String.valueOf(IntegerArgumentType.getInteger(c, "id")))))));

            root.then(Commands.literal("rayo")
                    .then(Commands.argument("fuerza", IntegerArgumentType.integer(1, CuboGame.MAX_LIGHTNING_STRENGTH))
                            .executes(c -> lightning(c.getSource(), IntegerArgumentType.getInteger(c, "fuerza"), 1, null))
                            .then(Commands.argument("veces", IntegerArgumentType.integer(1, 200))
                                    .executes(c -> lightning(c.getSource(), IntegerArgumentType.getInteger(c, "fuerza"), IntegerArgumentType.getInteger(c, "veces"), null))
                                    .then(Commands.literal("todos").executes(c -> lightning(c.getSource(), IntegerArgumentType.getInteger(c, "fuerza"), IntegerArgumentType.getInteger(c, "veces"), "todos")))
                                    .then(Commands.argument("id", IntegerArgumentType.integer(1))
                                            .executes(c -> lightning(c.getSource(), IntegerArgumentType.getInteger(c, "fuerza"), IntegerArgumentType.getInteger(c, "veces"),
                                                    String.valueOf(IntegerArgumentType.getInteger(c, "id"))))))));

            root.then(Commands.literal("seleccionar")
                    .then(Commands.argument("id", IntegerArgumentType.integer(1)).executes(c -> select(c.getSource(), IntegerArgumentType.getInteger(c, "id")))));
            root.then(Commands.literal("lista").executes(c -> list(c.getSource())));

            root.then(targeted("reiniciar", true));
            root.then(targeted("detener", false));

            root.then(Commands.literal("bloque")
                    .then(Commands.literal("arcoiris").executes(c -> block(c.getSource(), "")))
                    .then(Commands.argument("id", ResourceLocationArgument.id())
                            .executes(c -> block(c.getSource(), ResourceLocationArgument.getId(c, "id").toString()))));

            root.then(Commands.literal("victorias")
                    .executes(c -> wins(c.getSource()))
                    .then(Commands.literal("poner")
                            .then(Commands.argument("n", IntegerArgumentType.integer(-CuboGame.MAX_WINS, CuboGame.MAX_WINS))
                                    .executes(c -> {
                                        if (game == null) return fail(c.getSource(), "Mundo no listo.");
                                        game.setWins(IntegerArgumentType.getInteger(c, "n"));
                                        return reply(c.getSource(), "§a" + winsText());
                                    }))));

            root.then(Commands.literal("objetivo")
                    .executes(c -> game == null ? fail(c.getSource(), "Mundo no listo.") : reply(c.getSource(), "§a" + winsText()))
                    .then(Commands.argument("n", IntegerArgumentType.integer(-CuboGame.MAX_WINS, CuboGame.MAX_WINS))
                            .executes(c -> {
                                if (game == null) return fail(c.getSource(), "Mundo no listo.");
                                game.setGoal(IntegerArgumentType.getInteger(c, "n"));
                                return reply(c.getSource(), "§aObjetivo de wins: §f" + game.data().goal + " §7(" + winsText() + ")");
                            })));

            root.then(Commands.literal("contador")
                    .executes(c -> game == null ? fail(c.getSource(), "Mundo no listo.")
                            : reply(c.getSource(), "§aCuenta regresiva al llenar un cubo: §f" + game.data().countdown + " s"))
                    .then(Commands.argument("segundos", IntegerArgumentType.integer(0, CuboGame.MAX_COUNTDOWN))
                            .executes(c -> {
                                if (game == null) return fail(c.getSource(), "Mundo no listo.");
                                int seconds = IntegerArgumentType.getInteger(c, "segundos");
                                game.setCountdown(seconds);
                                return reply(c.getSource(), seconds == 0
                                        ? "§aSin cuenta regresiva: la victoria se suma apenas se llena el cubo."
                                        : "§aAl llenar un cubo empieza una cuenta regresiva de §f" + seconds + " s§a; al llegar a 0 se suma 1 win.");
                            })));

            root.then(Commands.literal("estado")
                    .executes(c -> status(c.getSource(), null))
                    .then(Commands.argument("id", IntegerArgumentType.integer(1)).executes(c -> status(c.getSource(), IntegerArgumentType.getInteger(c, "id")))));
            root.executes(c -> reply(c.getSource(), "§eUso: /cubo tamano <ancho> <alto> <largo> | iniciar | agregar [n] [id|todos] | seleccionar <id> | lista | bloque | reiniciar | detener | victorias | estado"));

            dispatcher.register(root);
        });
    }

    private static LiteralArgumentBuilder<CommandSourceStack> sideCommand(String name, int axis) {
        return Commands.literal(name).then(Commands.argument("n", IntegerArgumentType.integer(1, CuboGame.MAX_SIDE))
                .executes(c -> {
                    if (game == null) return fail(c.getSource(), "Mundo no listo.");
                    int n = IntegerArgumentType.getInteger(c, "n");
                    String error = game.setSize(axis == 0 ? n : null, axis == 1 ? n : null, axis == 2 ? n : null);
                    if (error != null) return fail(c.getSource(), error);
                    return sizeReply(c.getSource());
                }));
    }

    // reiniciar / detener [id|todos]: sin argumento actuan sobre el cubo seleccionado
    private static LiteralArgumentBuilder<CommandSourceStack> targeted(String name, boolean restart) {
        return Commands.literal(name)
                .executes(c -> act(c.getSource(), null, restart))
                .then(Commands.literal("todos").executes(c -> act(c.getSource(), "todos", restart)))
                .then(Commands.argument("id", IntegerArgumentType.integer(1))
                        .executes(c -> act(c.getSource(), String.valueOf(IntegerArgumentType.getInteger(c, "id")), restart)));
    }

    /** null = el seleccionado; "todos"; o un numero. Devuelve los cubos o null (y avisa del error). */
    private static List<CuboGame.Cube> resolve(CommandSourceStack source, String target) {
        List<CuboGame.Cube> out = new ArrayList<>();
        if ("todos".equals(target)) {
            out.addAll(game.cubes());
        } else if (target == null) {
            CuboGame.Cube cube = game.selected();
            if (cube != null) out.add(cube);
        } else {
            CuboGame.Cube cube = game.find(Integer.parseInt(target));
            if (cube != null) out.add(cube);
        }
        if (out.isEmpty()) {
            fail(source, game.cubes().isEmpty() ? "No hay ningún cubo. Usa /cubo iniciar." : "No existe ese cubo. Usa /cubo lista.");
            return null;
        }
        return out;
    }

    private static int act(CommandSourceStack source, String target, boolean restart) {
        if (game == null) return fail(source, "Mundo no listo.");
        List<CuboGame.Cube> cubes = resolve(source, target);
        if (cubes == null) return 0;
        for (CuboGame.Cube cube : cubes) {
            if (restart) game.restart(cube); else game.stop(cube);
        }
        return reply(source, restart ? "§aVaciando " + cubes.size() + " cubo(s) para empezar de nuevo..." : "§aQuitando " + cubes.size() + " cubo(s)...");
    }

    // /cubo tamano <ancho> <alto> <largo>: fija las medidas y crea el cubo en el acto (un solo comando)
    private static int size(CommandSourceStack source, int w, int h, int l) {
        if (game == null) return fail(source, "Mundo no listo.");
        String error = game.setSize(w, h, l);
        if (error != null) return fail(source, error);
        return start(source);
    }

    private static int sizeReply(CommandSourceStack source) {
        CuboGame.Data d = game.data();
        long inner = (long) (d.width - 2) * (d.height - 1) * (d.length - 2);
        return reply(source, "§aPróximos cubos: §f" + d.width + " de ancho × " + d.height + " de alto × " + d.length + " de largo §7(se llenan con " + inner
                + " bloques; el vidrio va dentro de esas medidas). Los cubos que ya existen no cambian.");
    }

    private static int start(CommandSourceStack source) {
        if (game == null) return fail(source, "Mundo no listo.");
        ServerPlayer player = source.getPlayer();
        if (player == null) {
            // lo manda la plataforma (sin jugador): se usa el primero que esté dentro del mundo
            List<ServerPlayer> online = source.getServer().getPlayerList().getPlayers();
            if (online.isEmpty()) {
                // sin jugadores (consola o plataforma): junto al punto de aparicion del mundo
                ServerLevel level = source.getLevel();
                net.minecraft.core.BlockPos spawn = level.getSharedSpawnPos();
                String[] error = new String[1];
                CuboGame.Cube cube = game.startFree(level, new net.minecraft.core.BlockPos(spawn.getX() + 4, spawn.getY() - 1, spawn.getZ()), error);
                if (cube == null) return fail(source, error[0]);
                return created(source, cube);
            }
            player = online.get(0);
        }
        String[] error = new String[1];
        CuboGame.Cube cube = game.start(player, error);
        if (cube == null) return fail(source, error[0]);
        return created(source, cube);
    }

    private static int created(CommandSourceStack source, CuboGame.Cube cube) {
        return reply(source, "§aCubo #" + cube.id + " creado (" + cube.w + "×" + cube.h + "×" + cube.l + ", se llena con " + cube.total()
                + " bloques) y seleccionado. Usa /cubo agregar <cantidad> para llenarlo. Pulsa K para abrir el menú.");
    }

    private static int add(CommandSourceStack source, int n, String target) {
        if (game == null) return fail(source, "Mundo no listo.");
        List<CuboGame.Cube> cubes = resolve(source, target);
        if (cubes == null) return 0;
        for (CuboGame.Cube cube : cubes) game.add(cube, n);
        return reply(source, "§a+" + n + " bloques en camino" + (cubes.size() > 1 ? " a cada uno de los " + cubes.size() + " cubos." : " al cubo #" + cubes.get(0).id + "."));
    }

    private static int tnt(CommandSourceStack source, int n, String target) {
        if (game == null) return fail(source, "Mundo no listo.");
        List<CuboGame.Cube> cubes = resolve(source, target);
        if (cubes == null) return 0;
        for (CuboGame.Cube cube : cubes) game.addTnt(cube, n);
        return reply(source, "§c" + n + " TNT caen sobre " + (cubes.size() > 1 ? cubes.size() + " cubos." : "el cubo #" + cubes.get(0).id + "."));
    }

    private static int vacuum(CommandSourceStack source, int layers, String target) {
        if (game == null) return fail(source, "Mundo no listo.");
        List<CuboGame.Cube> cubes = resolve(source, target);
        if (cubes == null) return 0;
        for (CuboGame.Cube cube : cubes) game.addVacuum(cube, layers);
        return reply(source, "§5Bomba de vacío: se quitan " + layers + " capa(s) " + (cubes.size() > 1 ? "de " + cubes.size() + " cubos." : "del cubo #" + cubes.get(0).id + "."));
    }

    private static int lightning(CommandSourceStack source, int strength, int times, String target) {
        if (game == null) return fail(source, "Mundo no listo.");
        List<CuboGame.Cube> cubes = resolve(source, target);
        if (cubes == null) return 0;
        for (CuboGame.Cube cube : cubes) game.addLightning(cube, strength, times);
        return reply(source, "§e" + times + " rayo(s) de fuerza " + strength + " caen sobre " + (cubes.size() > 1 ? cubes.size() + " cubos." : "el cubo #" + cubes.get(0).id + "."));
    }

    private static int select(CommandSourceStack source, int id) {
        if (game == null) return fail(source, "Mundo no listo.");
        CuboGame.Cube cube = game.find(id);
        if (cube == null) return fail(source, "No existe el cubo #" + id + ". Usa /cubo lista.");
        game.select(cube);
        return reply(source, "§aCubo #" + id + " seleccionado: los bloques de /cubo agregar y de los regalos van a este cubo.");
    }

    private static int list(CommandSourceStack source) {
        if (game == null) return fail(source, "Mundo no listo.");
        if (game.cubes().isEmpty()) return reply(source, "§eNo hay cubos. Usa /cubo iniciar.");
        CuboGame.Cube selected = game.selected();
        for (CuboGame.Cube cube : game.cubes()) {
            reply(source, (cube == selected ? "§a▶ " : "§7  ") + "#" + cube.id + " §f" + cube.w + "×" + cube.h + "×" + cube.l + " §7· " + cube.filled + "/" + cube.total()
                    + " · en (" + cube.ox + ", " + cube.oy + ", " + cube.oz + ")");
        }
        return 1;
    }

    private static int block(CommandSourceStack source, String id) {
        if (game == null) return fail(source, "Mundo no listo.");
        String error = game.setBlock(id);
        if (error != null) return fail(source, error);
        return reply(source, "§aMaterial: §f" + (id.isEmpty() ? "arcoíris (por capas)" : id) + " §7(para los cubos nuevos y el seleccionado; aplica a los bloques que se coloquen desde ahora)");
    }

    private static String winsText() {
        return game.data().wins + "/" + game.data().goal + " wins";
    }

    private static int wins(CommandSourceStack source) {
        if (game == null) return fail(source, "Mundo no listo.");
        return reply(source, "§6" + winsText());
    }

    private static int status(CommandSourceStack source, Integer id) {
        if (game == null) return fail(source, "Mundo no listo.");
        CuboGame.Data d = game.data();
        if (id != null) {
            CuboGame.Cube cube = game.find(id);
            if (cube == null) return fail(source, "No existe el cubo #" + id + ".");
            return reply(source, "§aCubo #" + cube.id + " " + cube.w + "×" + cube.h + "×" + cube.l + ": §f" + cube.filled + " / " + cube.total()
                    + " §a· en cola: §f" + cube.pending + (CuboGame.busy(cube) ? " §7(celebrando/vaciando)" : ""));
        }
        CuboGame.Cube selected = game.selected();
        String next = "Próximos: " + d.width + "×" + d.height + "×" + d.length;
        if (selected == null) return reply(source, "§eSin cubos. " + next + " · " + winsText() + ". Usa /cubo iniciar.");
        return reply(source, "§a" + game.cubes().size() + " cubo(s) · seleccionado #" + selected.id + ": §f" + selected.filled + " / " + selected.total()
                + " §a· en cola: §f" + selected.pending + " §a· §f" + winsText() + " §7· cuenta regresiva " + d.countdown + " s · " + next);
    }

    private static int reply(CommandSourceStack source, String message) {
        source.sendSuccess(() -> Component.literal(message), false);
        return 1;
    }

    private static int fail(CommandSourceStack source, String message) {
        source.sendFailure(Component.literal(message));
        return 0;
    }
}
