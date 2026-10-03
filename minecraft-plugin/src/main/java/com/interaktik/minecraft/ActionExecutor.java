package com.interaktik.minecraft;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.title.Title;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.entity.Arrow;
import org.bukkit.entity.IronGolem;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Mob;
import org.bukkit.entity.Player;
import org.bukkit.entity.TNTPrimed;
import org.bukkit.entity.Wolf;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.PlayerInventory;
import org.bukkit.metadata.FixedMetadataValue;
import org.bukkit.plugin.Plugin;
import org.bukkit.potion.PotionEffect;
import org.bukkit.potion.PotionEffectType;
import org.bukkit.scheduler.BukkitRunnable;
import org.bukkit.util.Vector;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Ejecuta cada accion del catalogo de la plataforma (backend/src/services/minecraftService.js)
 * sobre el jugador. Debe llamarse siempre desde el hilo principal.
 */
final class ActionExecutor {

    static final String TNT_METADATA = "interaktik-tnt";

    /** Acciones que entiende el plugin: los mismos "id" del catalogo de la plataforma. */
    static final List<String> ACTIONS = List.of(
            "zombie", "creeper", "skeleton", "spider", "enderman", "tnt", "lightning", "arrows", "launch",
            "teleport", "fire", "blindness", "slowness", "nausea", "levitation",
            "heal", "golden_apple", "food", "diamond", "armor", "xp", "iron_golem", "wolves",
            "speed", "strength", "regeneration", "jump");

    /** Nombre en pantalla de cada accion (para el aviso al jugador). */
    private static final Map<String, String> LABELS = Map.ofEntries(
            Map.entry("zombie", "Zombies"), Map.entry("creeper", "Creepers"), Map.entry("skeleton", "Esqueletos"),
            Map.entry("spider", "Arañas"), Map.entry("enderman", "Endermans"), Map.entry("tnt", "TNT"),
            Map.entry("lightning", "Rayos"), Map.entry("arrows", "Flechas"), Map.entry("launch", "Lanzamiento"),
            Map.entry("teleport", "Teletransporte"), Map.entry("fire", "Fuego"), Map.entry("blindness", "Ceguera"),
            Map.entry("slowness", "Lentitud"), Map.entry("nausea", "Mareo"), Map.entry("levitation", "Levitación"),
            Map.entry("heal", "Curación"), Map.entry("golden_apple", "Manzanas doradas"), Map.entry("food", "Carne"),
            Map.entry("diamond", "Diamantes"), Map.entry("armor", "Armadura de hierro"), Map.entry("xp", "Niveles"),
            Map.entry("iron_golem", "Golem de hierro"), Map.entry("wolves", "Lobos"), Map.entry("speed", "Velocidad"),
            Map.entry("strength", "Fuerza"), Map.entry("regeneration", "Regeneración"), Map.entry("jump", "Super salto"));

    /** Acciones que ayudan: el aviso sale en verde; las demas en rojo. */
    private static final List<String> HELP = List.of(
            "heal", "golden_apple", "food", "diamond", "armor", "xp", "iron_golem", "wolves",
            "speed", "strength", "regeneration", "jump");

    record Item(String nickname, String action, int amount) {
    }

    private final Plugin plugin;

    ActionExecutor(Plugin plugin) {
        this.plugin = plugin;
    }

    void run(Player player, Item item) {
        int amount = Math.max(1, item.amount());

        switch (item.action()) {
            case "zombie" -> spawnMobs(player, org.bukkit.entity.Zombie.class, amount, item);
            case "creeper" -> spawnMobs(player, org.bukkit.entity.Creeper.class, amount, item);
            case "skeleton" -> spawnMobs(player, org.bukkit.entity.Skeleton.class, amount, item);
            case "spider" -> spawnMobs(player, org.bukkit.entity.Spider.class, amount, item);
            case "enderman" -> spawnMobs(player, org.bukkit.entity.Enderman.class, amount, item);
            case "tnt" -> tnt(player, amount);
            case "lightning" -> lightning(player, amount);
            case "arrows" -> arrows(player, amount);
            case "launch" -> launch(player, amount);
            case "teleport" -> teleport(player, amount);
            case "fire" -> player.setFireTicks(Math.max(player.getFireTicks(), amount * 20));
            case "blindness" -> effect(player, "blindness", amount, 0);
            case "slowness" -> effect(player, "slowness", amount, 1);
            case "nausea" -> effect(player, "nausea", amount, 0);
            case "levitation" -> effect(player, "levitation", amount, 0);
            case "heal" -> heal(player);
            case "golden_apple" -> give(player, new ItemStack(Material.GOLDEN_APPLE, amount));
            case "food" -> give(player, new ItemStack(Material.COOKED_BEEF, amount));
            case "diamond" -> give(player, new ItemStack(Material.DIAMOND, amount));
            case "armor" -> armor(player);
            case "xp" -> player.giveExpLevels(amount);
            case "iron_golem" -> golems(player, amount);
            case "wolves" -> wolves(player, amount);
            case "speed" -> effect(player, "speed", amount, 1);
            case "strength" -> effect(player, "strength", amount, 1);
            case "regeneration" -> effect(player, "regeneration", amount, 1);
            case "jump" -> effect(player, "jump_boost", amount, 2);
            default -> {
                plugin.getLogger().warning("Acción desconocida: " + item.action());
                return;
            }
        }

        announce(player, item);
    }

    // ------------------------------------------------------------------------------------ aviso

    private void announce(Player player, Item item) {
        if (!plugin.getConfig().getBoolean("announce", true)) return;

        boolean help = HELP.contains(item.action());
        String label = LABELS.getOrDefault(item.action(), item.action());
        boolean hasAmount = !List.of("heal", "armor").contains(item.action());

        Component title = Component.text(item.nickname(), help ? NamedTextColor.GREEN : NamedTextColor.RED);
        Component subtitle = Component.text(
                (help ? "te dio " : "te lanzó ") + (hasAmount ? item.amount() + " " : "") + label,
                NamedTextColor.WHITE);

        player.showTitle(Title.title(title, subtitle,
                Title.Times.times(Duration.ofMillis(150), Duration.ofMillis(1100), Duration.ofMillis(350))));
    }

    // ------------------------------------------------------------------------------------ mobs

    private <T extends LivingEntity> void spawnMobs(Player player, Class<T> type, int amount, Item item) {
        World world = player.getWorld();
        for (int i = 0; i < amount; i++) {
            Location spot = safeSpotAround(player.getLocation(), 4, 8);
            T mob = world.spawn(spot, type);
            // El mob lleva el nombre de quien mando el regalo
            mob.customName(Component.text(item.nickname(), NamedTextColor.YELLOW));
            mob.setCustomNameVisible(true);
            if (mob instanceof Mob hostile) hostile.setTarget(player);
        }
    }

    private void golems(Player player, int amount) {
        for (int i = 0; i < amount; i++) {
            IronGolem golem = player.getWorld().spawn(safeSpotAround(player.getLocation(), 3, 5), IronGolem.class);
            golem.setPlayerCreated(true); // aliado: no ataca al jugador
        }
    }

    private void wolves(Player player, int amount) {
        for (int i = 0; i < amount; i++) {
            Wolf wolf = player.getWorld().spawn(safeSpotAround(player.getLocation(), 2, 4), Wolf.class);
            wolf.setOwner(player);
            wolf.setTamed(true);
        }
    }

    // ------------------------------------------------------------------------------------ explosivos y clima

    private void tnt(Player player, int amount) {
        World world = player.getWorld();
        for (int i = 0; i < amount; i++) {
            Location spot = safeSpotAround(player.getLocation(), 2, 5);
            TNTPrimed tnt = world.spawn(spot, TNTPrimed.class);
            tnt.setFuseTicks(60 + ThreadLocalRandom.current().nextInt(30));
            tnt.setMetadata(TNT_METADATA, new FixedMetadataValue(plugin, true));
        }
    }

    private void lightning(Player player, int amount) {
        new BukkitRunnable() {
            int left = amount;

            @Override
            public void run() {
                if (left-- <= 0 || !player.isOnline()) {
                    cancel();
                    return;
                }
                Location spot = safeSpotAround(player.getLocation(), 1, 4);
                player.getWorld().strikeLightning(spot);
            }
        }.runTaskTimer(plugin, 0L, 8L);
    }

    private void arrows(Player player, int amount) {
        new BukkitRunnable() {
            int left = amount;

            @Override
            public void run() {
                if (left <= 0 || !player.isOnline()) {
                    cancel();
                    return;
                }
                // Hasta 6 flechas por tick para que caigan en una o dos oleadas
                int batch = Math.min(left, 6);
                for (int i = 0; i < batch; i++) {
                    ThreadLocalRandom random = ThreadLocalRandom.current();
                    Location from = player.getLocation().add(random.nextDouble(-4, 4), 14, random.nextDouble(-4, 4));
                    Arrow arrow = player.getWorld().spawnArrow(from, new Vector(0, -1, 0), 1.6f, 4f);
                    arrow.setPickupStatus(Arrow.PickupStatus.DISALLOWED);
                }
                left -= batch;
            }
        }.runTaskTimer(plugin, 0L, 4L);
    }

    // ------------------------------------------------------------------------------------ movimiento

    private void launch(Player player, int strength) {
        ThreadLocalRandom random = ThreadLocalRandom.current();
        double up = Math.min(3.5, 0.5 + strength * 0.1);
        player.setVelocity(new Vector(random.nextDouble(-0.4, 0.4), up, random.nextDouble(-0.4, 0.4)));
    }

    private void teleport(Player player, int radius) {
        ThreadLocalRandom random = ThreadLocalRandom.current();
        Location origin = player.getLocation();
        World world = origin.getWorld();

        for (int attempt = 0; attempt < 12; attempt++) {
            double angle = random.nextDouble(0, Math.PI * 2);
            double distance = random.nextDouble(radius * 0.4, radius);
            int x = origin.getBlockX() + (int) Math.round(Math.cos(angle) * distance);
            int z = origin.getBlockZ() + (int) Math.round(Math.sin(angle) * distance);

            Location target = null;
            if (world.getEnvironment() == World.Environment.NORMAL) {
                // Superficie: nunca dentro de una cueva ni sobre agua o lava
                Block ground = world.getHighestBlockAt(x, z);
                if (ground.isLiquid() || !ground.getType().isSolid()) continue;
                target = ground.getLocation().add(0.5, 1, 0.5);
            } else {
                // Nether / End: se busca un hueco libre a la misma altura
                target = findOpenSpotNear(new Location(world, x + 0.5, origin.getY(), z + 0.5));
            }

            if (target != null) {
                target.setYaw(origin.getYaw());
                target.setPitch(origin.getPitch());
                player.teleport(target);
                return;
            }
        }
        // Sin sitio seguro: un pequeño salto para que igual se note
        launch(player, 6);
    }

    // ------------------------------------------------------------------------------------ ayuda

    private void heal(Player player) {
        player.setHealth(player.getMaxHealth());
        player.setFoodLevel(20);
        player.setSaturation(20f);
        player.setFireTicks(0);
    }

    private void give(Player player, ItemStack stack) {
        // Lo que no cabe en el inventario cae a los pies del jugador
        player.getInventory().addItem(stack).values()
                .forEach(left -> player.getWorld().dropItemNaturally(player.getLocation(), left));
    }

    private void armor(Player player) {
        PlayerInventory inventory = player.getInventory();
        equipOrGive(player, inventory, EquipmentSlot.HEAD, new ItemStack(Material.IRON_HELMET));
        equipOrGive(player, inventory, EquipmentSlot.CHEST, new ItemStack(Material.IRON_CHESTPLATE));
        equipOrGive(player, inventory, EquipmentSlot.LEGS, new ItemStack(Material.IRON_LEGGINGS));
        equipOrGive(player, inventory, EquipmentSlot.FEET, new ItemStack(Material.IRON_BOOTS));
    }

    private void equipOrGive(Player player, PlayerInventory inventory, EquipmentSlot slot, ItemStack piece) {
        ItemStack current = inventory.getItem(slot);
        if (current == null || current.getType() == Material.AIR) {
            inventory.setItem(slot, piece);
        } else {
            give(player, piece);
        }
    }

    // ------------------------------------------------------------------------------------ efectos

    /** Los nombres "minecraft:xxx" son iguales en todas las versiones (a diferencia de las constantes de Bukkit). */
    private void effect(Player player, String key, int seconds, int level) {
        PotionEffectType type = PotionEffectType.getByKey(NamespacedKey.minecraft(key));
        if (type == null) {
            plugin.getLogger().warning("Este servidor no tiene el efecto '" + key + "'.");
            return;
        }
        player.addPotionEffect(new PotionEffect(type, seconds * 20, level, false, true, true));
    }

    // ------------------------------------------------------------------------------------ ubicaciones

    /** Busca un lugar libre (pies y cabeza sin bloques solidos, con suelo) cerca de un punto. */
    private Location findOpenSpotNear(Location around) {
        for (int dy : new int[]{0, 1, -1, 2, -2, 3, -3}) {
            Location candidate = around.clone().add(0, dy, 0);
            Block feet = candidate.getBlock();
            Block head = feet.getRelative(0, 1, 0);
            Block floor = feet.getRelative(0, -1, 0);
            if (!feet.getType().isSolid() && !head.getType().isSolid() && !feet.isLiquid()
                    && floor.getType().isSolid() && !floor.isLiquid()) {
                return candidate;
            }
        }
        return null;
    }

    /** Punto al azar entre minRadius y maxRadius del jugador; si no hay sitio libre, junto a el. */
    private Location safeSpotAround(Location center, double minRadius, double maxRadius) {
        ThreadLocalRandom random = ThreadLocalRandom.current();
        for (int attempt = 0; attempt < 8; attempt++) {
            double angle = random.nextDouble(0, Math.PI * 2);
            double distance = random.nextDouble(minRadius, maxRadius);
            Location around = center.clone().add(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
            Location open = findOpenSpotNear(around);
            if (open != null) return open;
        }
        return center.clone().add(0, 0.5, 0);
    }
}
