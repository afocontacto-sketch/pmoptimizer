import { Card, CardContent, Typography } from "@mui/material";
import { PieChart } from "@mui/x-charts/PieChart";

export type PieSlice = { label: string; value: number; color?: string };

export type PieChartCardProps = {
  title: string;
  data: PieSlice[];
  valueFormatter?: (value: number) => string;
  height?: number;
};

export function PieChartCard({ title, data, valueFormatter, height = 260 }: PieChartCardProps) {
  const formatter = valueFormatter ?? ((value: number) => String(value));
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>{title}</Typography>
        <PieChart
          height={height}
          series={[{
            innerRadius: 55,
            outerRadius: 100,
            paddingAngle: 2,
            data: data.map((slice, id) => ({ id, label: slice.label, value: slice.value, color: slice.color })),
            valueFormatter: (item) => formatter(item.value),
          }]}
        />
      </CardContent>
    </Card>
  );
}
