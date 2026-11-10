import { useState } from "react";
import { Box, Tab, Tabs, Typography } from "@mui/material";
import type { Role } from "../app/roles";
import IndustrialRoutes from "./IndustrialRoutes";
import EquipmentMaster from "./materials/EquipmentMaster";
import MaterialsMaster from "./materials/MaterialsMaster";

// Ingeniería e Industrial: hojas de ruta, maestro de materiales y de equipos (edición según permisos del rol).
export default function EngineeringPage({ user, role }: { user: string; role: Role }) {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2, fontWeight: 700 }}>Ingeniería e Industrial</Typography>
      <Tabs value={tab} onChange={(_, value: number) => setTab(value)} sx={{ mb: 3 }}>
        <Tab label="Hojas de ruta" />
        <Tab label="Materiales" />
        <Tab label="Equipos" />
      </Tabs>
      {tab === 0 && <IndustrialRoutes user={user} role={role} />}
      {tab === 1 && <MaterialsMaster mode={role === "Administrador" || role === "Ingeniería e Industrial" ? "master" : "readonly"} user={user} role={role} />}
      {tab === 2 && <EquipmentMaster user={user} role={role} />}
    </Box>
  );
}
