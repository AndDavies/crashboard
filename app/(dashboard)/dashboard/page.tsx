import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CalendarIcon, FileTextIcon, BarChart3Icon, UserIcon } from "lucide-react"
import { DashboardChart } from "@/components/dashboard-chart"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import DashboardRemindersWidget from "@/components/dashboard/DashboardRemindersWidget"
import DashboardEnergyTrends from "@/components/dashboard/DashboardEnergyTrends"
import DashboardActivitySummary from "@/components/dashboard/DashboardActivitySummary"

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Get user email or fallback
  const userEmail = user?.email || "User"
  
  // Get reminders data
  const { data: reminders } = await supabase
    .from("reminders")
    .select("*")
    .order("created_at", { ascending: false })
    .eq("user_id", user?.id)
  
  // Filter reminders for today
  const today = new Date()
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
  
  const todayReminders = reminders?.filter(
    (r) => new Date(r.created_at) >= new Date(startOfDay) && !r.is_archived && !r.is_done
  ) || []
  
  // Filter need-to-do reminders
  const needToDoReminders = reminders?.filter(
    (r) => r.need_to_do && !r.is_archived && !r.is_done
  ) || []

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Welcome back, {userEmail}</h1>
        <p className="text-muted-foreground">Here's an overview of your personal dashboard.</p>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Today's Reminders</CardTitle>
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{todayReminders.length}</div>
                <p className="text-xs text-muted-foreground">
                  {todayReminders.length ? `${todayReminders.length} tasks for today` : "No tasks for today"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Need To Do</CardTitle>
                <FileTextIcon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{needToDoReminders.length}</div>
                <p className="text-xs text-muted-foreground">
                  {needToDoReminders.length ? `${needToDoReminders.length} important tasks` : "No critical tasks"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
                <BarChart3Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {reminders && reminders.length > 0 ? (
                  <>
                    <div className="text-2xl font-bold">
                      {Math.round((reminders.filter(r => r.is_done).length / reminders.length) * 100)}%
                    </div>
                    <p className="text-xs text-muted-foreground">Task completion rate</p>
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-bold">--</div>
                    <p className="text-xs text-muted-foreground">No tasks yet</p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Energy Balance</CardTitle>
                <UserIcon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {reminders && reminders.some(r => r.energy_scale !== null) ? (
                  <>
                    <div className="text-2xl font-bold">
                      {Math.round(reminders
                        .filter(r => r.energy_scale !== null)
                        .reduce((acc, r) => acc + (r.energy_scale || 0), 0) / 
                        reminders.filter(r => r.energy_scale !== null).length
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Average energy required</p>
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-bold">--</div>
                    <p className="text-xs text-muted-foreground">No energy data yet</p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Analytics Overview</CardTitle>
              <CardDescription>Your personal analytics data over time</CardDescription>
            </CardHeader>
            <CardContent className="pl-2">
              <DashboardChart />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Your recent actions and updates</CardDescription>
            </CardHeader>
            <CardContent>
              <DashboardActivitySummary reminders={reminders || []} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <DashboardRemindersWidget 
          todayReminders={todayReminders} 
          needToDoReminders={needToDoReminders}
        />

        <DashboardEnergyTrends reminders={reminders || []} />
      </div>
    </div>
  )
}