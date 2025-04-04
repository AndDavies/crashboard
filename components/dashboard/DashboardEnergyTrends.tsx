"use client";

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  Legend
} from "recharts";

type Reminder = {
  id: string;
  title: string;
  content: string | null;
  tags: string[];
  created_at: string;
  is_pinned: boolean;
  color: string;
  need_to_do: boolean;
  want_to_do: boolean;
  is_archived: boolean;
  is_done: boolean;
  energy_scale: number | null;
};

interface DashboardEnergyTrendsProps {
  reminders: Reminder[];
}

export default function DashboardEnergyTrends({ reminders }: DashboardEnergyTrendsProps) {
  // Prepare distribution of energy levels
  const energyDistribution = useMemo(() => {
    const energyLevels: Record<string, number> = {
      "Low (1-3)": 0,
      "Medium (4-7)": 0,
      "High (8-10)": 0
    };
    
    reminders
      .filter(r => r.energy_scale !== null)
      .forEach(reminder => {
        const energyScale = reminder.energy_scale || 0;
        if (energyScale <= 3) {
          energyLevels["Low (1-3)"]++;
        } else if (energyScale <= 7) {
          energyLevels["Medium (4-7)"]++;
        } else {
          energyLevels["High (8-10)"]++;
        }
      });
    
    return Object.entries(energyLevels).map(([name, value]) => ({ name, value }));
  }, [reminders]);
  
  // Calculate average energy by need/want categories
  const energyByCategory = useMemo(() => {
    const categories = [
      { name: "Need-to-do", reminders: reminders.filter(r => r.need_to_do) },
      { name: "Want-to-do", reminders: reminders.filter(r => r.want_to_do) },
      { name: "Others", reminders: reminders.filter(r => !r.need_to_do && !r.want_to_do) }
    ];
    
    return categories.map(category => {
      const filteredReminders = category.reminders.filter(r => r.energy_scale !== null);
      const totalEnergy = filteredReminders.reduce((sum, r) => sum + (r.energy_scale || 0), 0);
      const count = filteredReminders.length;
      
      return {
        name: category.name,
        value: count > 0 ? Math.round((totalEnergy / count) * 10) / 10 : 0,
        count
      };
    });
  }, [reminders]);

  // Colors for the pie chart
  const COLORS = ['#10B981', '#F59E0B', '#EF4444'];
  
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background p-2 border rounded shadow-sm text-xs">
          <p className="font-medium">{`${payload[0].name}: ${payload[0].value}`}</p>
          {payload[0].payload.count !== undefined && (
            <p className="text-muted-foreground">{`${payload[0].payload.count} reminders`}</p>
          )}
        </div>
      );
    }
    return null;
  };

  const hasEnergyData = reminders.some(r => r.energy_scale !== null);

  return (
    <Card className="col-span-1">
      <CardHeader>
        <CardTitle>Energy Insights</CardTitle>
        <CardDescription>Energy required for your reminders</CardDescription>
      </CardHeader>
      <CardContent>
        {hasEnergyData ? (
          <div className="space-y-6">
            <div className="h-60">
              <h3 className="text-sm font-medium mb-2">Energy Distribution</h3>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={energyDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => 
                      `${name}: ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {energyDistribution.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={COLORS[index % COLORS.length]} 
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div className="h-60 pt-2">
              <h3 className="text-sm font-medium mb-2">Average Energy by Category</h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={energyByCategory}>
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis domain={[0, 10]} fontSize={12} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar 
                    dataKey="value" 
                    fill="#6366F1" 
                    radius={[4, 4, 0, 0]} 
                    name="Average Energy" 
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="h-[400px] flex items-center justify-center text-muted-foreground">
            <p>No energy data available yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 