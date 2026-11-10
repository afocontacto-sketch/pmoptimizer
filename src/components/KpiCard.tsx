import { Paper, Typography } from "@mui/material";

export function KpiCard({ label, value, outlined = false }: { label: string; value: string; outlined?: boolean }) {
  return (
    <Paper variant={outlined ? "outlined" : "elevation"} sx={{ p: 2, ...(outlined ? {} : { height: "100%" }) }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="h6" sx={{ mt: outlined ? 0.5 : 1, ...(outlined ? {} : { fontWeight: 700 }) }}>{value}</Typography>
    </Paper>
  );
}
