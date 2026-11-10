import { useState } from "react";
import { Avatar, Box, Stack, Typography } from "@mui/material";

export function BrandLogo({ compact = false, size }: { compact?: boolean; size?: number }) {
  const [logoUnavailable, setLogoUnavailable] = useState(false);
  const logoSize = size ?? (compact ? 48 : 160);

  if (!logoUnavailable) {
    return (
      <Box
        component="img"
        src={`${import.meta.env.BASE_URL}logo-pmoptimizer.jpg`}
        alt="PM Optimizer 360 · Consultoría Industrial"
        onError={() => setLogoUnavailable(true)}
        sx={{ width: logoSize, height: logoSize, objectFit: "contain", borderRadius: 2, bgcolor: "#fff" }}
      />
    );
  }

  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
      <Avatar
        variant="rounded"
        sx={{ width: compact ? 42 : 64, height: compact ? 42 : 64, bgcolor: "#2563eb", fontWeight: 800 }}
      >
        PMO
      </Avatar>
      <Typography
        variant={compact ? "subtitle1" : "overline"}
        sx={{ fontWeight: 800, letterSpacing: compact ? 0.8 : 2, color: "inherit" }}
      >
        PMOPTIMIZER
      </Typography>
    </Stack>
  );
}
