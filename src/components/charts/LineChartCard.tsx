import { Card, CardContent, Typography } from "@mui/material";
import { LineChart } from "@mui/x-charts/LineChart";

export type LineSeries = { label: string; data: number[]; color?: string };

export type LineChartCardProps = {
  title: string;
  categories: string[];
  series: LineSeries[];
  valueFormatter?: (value: number | null) => string;
  height?: number;
};

export function LineChartCard({ title, categories, series, valueFormatter, height = 300 }: LineChartCardProps) {
  const formatter = valueFormatter ?? ((value: number | null) => String(value ?? ""));
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>{title}</Typography>
        <LineChart
          height={height}
          xAxis={[{ scaleType: "point", data: categories }]}
          series={series.map((s) => ({ label: s.label, data: s.data, color: s.color, valueFormatter: formatter }))}
        />
      </CardContent>
    </Card>
  );
}
