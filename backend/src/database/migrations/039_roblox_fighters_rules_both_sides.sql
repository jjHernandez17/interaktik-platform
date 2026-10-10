-- Las reglas de regalos valen para los dos lados: el poder lo activa el lado que eligio el espectador.
UPDATE roblox_fighters_gift_rules SET side = 'viewer' WHERE side <> 'viewer';
