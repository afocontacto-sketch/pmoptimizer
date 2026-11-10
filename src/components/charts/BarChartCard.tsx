import { Card, CardContent, Typography } from "@mui/material";
import { BarChart } from "@mui/x-charts/BarChart";

export type BarSeries = { label: string; data: Array<number | null>; color?: string; stack?: string };

export type BarChartCardProps = {
  title: string;
  categories: string[];
  series: BarSeries[];
  valueFormatter?: (value: number | null) => string;
  highlight?: (index: number) => boolean;
  height?: number;
};

const HIGHLIGHT_COLOR = "#dc2626";
const DEFAULT_COLOR = "#2563eb";

export function BarChartCard({ title, categories, series, valueFormatter, highlight, height = 300 }: BarChartCardProps) {
  const formatter = valueFormatter ?? ((value: number | null) => String(value ?? ""));
  const baseColor = series[0]?.color ?? DEFAULT_COLOR;
  const colorMap = highlight && series.length === 1
    ? {
        type: "ordinal" as const,
        values: categories,
        colors: categories.map((_, index) => (highlight(index) ? HIGHLIGHT_COLOR : baseColor)),
      }
    : undefined;
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>{title}</Typography>
        <BarChart
          height={height}
          xAxis={[{ scaleType: "band", data: categories, colorMap }]}
          series={series.map((s) => ({ label: s.label, data: s.data, color: s.color, stack: s.stack, valueFormatter: formatter }))}
        />
      </CardContent>
    </Card>
  );
}
