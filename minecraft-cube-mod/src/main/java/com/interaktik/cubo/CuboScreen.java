package com.interaktik.cubo;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/**
 * Menu visual del Cubo Gigante. No tiene logica propia: manda los mismos comandos /cubo que se escribirian en el
 * chat (asi funciona igual en mundos de un jugador, LAN y servidores). Si el mundo corre en este mismo proceso,
 * los campos arrancan con los valores actuales.
 */
final class CuboScreen extends Screen {

    private static final String[][] MATERIALS = {
            {"", "Arcoíris (colores por capas)"},
            {"minecraft:stone", "Piedra"},
            {"minecraft:cobblestone", "Adoquín"},
            {"minecraft:oak_planks", "Tablones de roble"},
            {"minecraft:bricks", "Ladrillos"},
            {"minecraft:gold_block", "Oro"},
            {"minecraft:diamond_block", "Diamante"},
            {"minecraft:emerald_block", "Esmeralda"},
            {"minecraft:tnt", "TNT"},
            {"minecraft:dirt", "Tierra"},
            {"minecraft:sand", "Arena"},
            {"minecraft:obsidian", "Obsidiana"},
            {"minecraft:white_wool", "Lana blanca"},
    };

    // recordado entre aperturas del menu
    private static String savedW = "10", savedH = "10", savedL = "10", savedCountdown = "10", savedGoal = "10";
    private static int savedMaterial = 0;

    private EditBox boxW, boxH, boxL, boxCountdown, boxGoal, boxWins;
    private Button materialButton;
    private int material = savedMaterial;
    private String status = "";
    private int statusColor = 0xFF8080;
    private int left;
    private int top;

    CuboScreen() {
        super(Component.literal("Cubo Gigante"));
    }

    @Override
    protected void init() {
        left = width / 2 - 150;
        top = Math.max(12, height / 2 - 118);

        // valores actuales si el mundo esta en este mismo proceso
        String winsValue = "";
        CuboGame game = CuboMod.game();
        if (game != null && Minecraft.getInstance().getSingleplayerServer() != null) {
            CuboGame.Data d = game.data();
            savedW = String.valueOf(d.width);
            savedH = String.valueOf(d.height);
            savedL = String.valueOf(d.length);
            savedCountdown = String.valueOf(d.countdown);
            savedGoal = String.valueOf(d.goal);
            winsValue = String.valueOf(d.wins);
            for (int i = 0; i < MATERIALS.length; i++) if (MATERIALS[i][0].equals(d.block)) material = i;
        }

        int y = top + 30;
        boxW = number(left, y, 94, savedW, false);
        boxH = number(left + 103, y, 94, savedH, false);
        boxL = number(left + 206, y, 94, savedL, false);

        y += 46;
        materialButton = Button.builder(materialLabel(), button -> {
            material = (material + 1) % MATERIALS.length;
            button.setMessage(materialLabel());
        }).bounds(left, y, 300, 20).build();
        addRenderableWidget(materialButton);

        y += 46;
        boxCountdown = number(left, y, 94, savedCountdown, false);
        boxGoal = number(left + 103, y, 94, savedGoal, true);
        boxWins = number(left + 206, y, 94, winsValue, true);

        y += 34;
        addRenderableWidget(Button.builder(Component.literal("§aCrear cubo"), button -> create()).bounds(left, y, 147, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Guardar contador y wins"), button -> saveCounters()).bounds(left + 153, y, 147, 20).build());

        y += 26;
        addRenderableWidget(Button.builder(Component.literal("Vaciar todos los cubos"), button -> run("cubo reiniciar todos")).bounds(left, y, 147, 20).build());
        addRenderableWidget(Button.builder(Component.literal("§cQuitar todos los cubos"), button -> run("cubo detener todos")).bounds(left + 153, y, 147, 20).build());

        y += 26;
        addRenderableWidget(Button.builder(Component.literal("Cerrar"), button -> onClose()).bounds(left, y, 300, 20).build());
    }

    private EditBox number(int x, int y, int w, String value, boolean allowNegative) {
        EditBox box = new EditBox(font, x, y, w, 20, Component.empty());
        box.setMaxLength(9);
        box.setFilter(text -> text.matches(allowNegative ? "-?\\d*" : "\\d*"));
        box.setValue(value);
        addRenderableWidget(box);
        return box;
    }

    private Component materialLabel() {
        return Component.literal("Material: " + MATERIALS[material][1]);
    }

    private static Integer parse(EditBox box) {
        String text = box.getValue().trim();
        if (text.isEmpty() || text.equals("-")) return null;
        try {
            return Integer.parseInt(text);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private void remember() {
        savedW = boxW.getValue(); savedH = boxH.getValue(); savedL = boxL.getValue();
        savedCountdown = boxCountdown.getValue(); savedGoal = boxGoal.getValue();
        savedMaterial = material;
    }

    private void error(String message) {
        status = message;
        statusColor = 0xFF8080;
    }

    private void run(String command) {
        Minecraft minecraft = Minecraft.getInstance();
        if (minecraft.player == null) return;
        minecraft.player.connection.sendCommand(command);
    }

    /** Manda material, contador, objetivo y (si hay) wins. Devuelve false si algun campo no es valido. */
    private boolean sendCounters() {
        Integer countdown = parse(boxCountdown);
        Integer goal = parse(boxGoal);
        if (countdown == null || countdown < 0 || countdown > CuboGame.MAX_COUNTDOWN) { error("La cuenta regresiva va de 0 a " + CuboGame.MAX_COUNTDOWN + " segundos."); return false; }
        if (goal == null || Math.abs(goal) > CuboGame.MAX_WINS) { error("El objetivo de wins va de -1 000 000 a 1 000 000."); return false; }
        Integer wins = parse(boxWins);
        if (!boxWins.getValue().trim().isEmpty() && (wins == null || Math.abs(wins) > CuboGame.MAX_WINS)) { error("Los wins van de -1 000 000 a 1 000 000."); return false; }

        run("cubo bloque " + (MATERIALS[material][0].isEmpty() ? "arcoiris" : MATERIALS[material][0]));
        run("cubo contador " + countdown);
        run("cubo objetivo " + goal);
        if (wins != null) run("cubo victorias poner " + wins);
        return true;
    }

    private void saveCounters() {
        if (!sendCounters()) return;
        remember();
        status = "Guardado.";
        statusColor = 0x80FF80;
    }

    private void create() {
        Integer w = parse(boxW), h = parse(boxH), l = parse(boxL);
        if (w == null || h == null || l == null) { error("Escribe el ancho, el alto y el largo."); return; }
        if (w < CuboGame.MIN_WIDTH || h < CuboGame.MIN_HEIGHT || l < CuboGame.MIN_LENGTH) {
            error("Mínimos: ancho " + CuboGame.MIN_WIDTH + ", alto " + CuboGame.MIN_HEIGHT + " y largo " + CuboGame.MIN_LENGTH + ".");
            return;
        }
        if (w > CuboGame.MAX_SIDE || h > CuboGame.MAX_SIDE || l > CuboGame.MAX_SIDE) { error("Cada medida puede ser de hasta " + CuboGame.MAX_SIDE + "."); return; }
        if (!sendCounters()) return;
        remember();
        run("cubo tamano " + w + " " + h + " " + l); // crea el cubo
        onClose();
    }

    @Override
    public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
        super.render(graphics, mouseX, mouseY, partialTick);
        graphics.drawCenteredString(font, "§l§bCubo Gigante", width / 2, top, 0xFFFFFF);
        graphics.drawCenteredString(font, "Medidas del cubo completo (el vidrio va dentro de esas medidas)", width / 2, top + 12, 0xA0A0A0);

        graphics.drawString(font, "Ancho", left, top + 30 - 10, 0xE0E0E0);
        graphics.drawString(font, "Alto", left + 103, top + 30 - 10, 0xE0E0E0);
        graphics.drawString(font, "Largo", left + 206, top + 30 - 10, 0xE0E0E0);

        int y2 = top + 30 + 46 + 46;
        graphics.drawString(font, "Cuenta regresiva (s)", left, y2 - 10, 0xE0E0E0);
        graphics.drawString(font, "Objetivo de wins", left + 103, y2 - 10, 0xE0E0E0);
        graphics.drawString(font, "Wins actuales", left + 206, y2 - 10, 0xE0E0E0);

        int bottom = y2 + 34 + 26 + 26 + 26;
        if (!status.isEmpty()) graphics.drawCenteredString(font, status, width / 2, bottom, statusColor);
        graphics.drawCenteredString(font, "Al llenar un cubo empieza la cuenta regresiva y al llegar a 0 suma 1 win", width / 2, bottom + 14, 0x808080);
    }

    @Override
    public void onClose() {
        Minecraft.getInstance().setScreen(null);
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }
}
