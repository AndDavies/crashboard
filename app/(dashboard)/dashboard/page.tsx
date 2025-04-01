import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CalendarIcon, FileTextIcon, BarChart3Icon, UserIcon } from "lucide-react"
import { DashboardChart } from "@/components/dashboard-chart"
import { createSupabaseServerClient } from "@/utils/supabase/server"; // Updated import

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient() // Await here
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Get user email or fallback
  const userEmail = user?.email || "User"

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Welcome, {userEmail}</h1>
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
                <CardTitle className="text-sm font-medium">Tasks</CardTitle>
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">12</div>
                <p className="text-xs text-muted-foreground">4 tasks due today</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Documents</CardTitle>
                <FileTextIcon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">24</div>
                <p className="text-xs text-muted-foreground">3 new this week</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Analytics</CardTitle>
                <BarChart3Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">+12%</div>
                <p className="text-xs text-muted-foreground">Increase from last month</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Profile</CardTitle>
                <UserIcon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">85%</div>
                <p className="text-xs text-muted-foreground">Profile completion</p>
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
              <div className="space-y-8">
                {recentActivities.map((activity) => (
                  <div key={activity.id} className="flex items-center">
                    <div className="mr-4 rounded-full p-2 bg-muted">
                      <activity.icon className="h-4 w-4" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none">{activity.title}</p>
                      <p className="text-sm text-muted-foreground">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Tasks</CardTitle>
            <CardDescription>Your scheduled tasks for the week</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {upcomingTasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">{task.title}</p>
                    <p className="text-sm text-muted-foreground">{task.dueDate}</p>
                  </div>
                  <div
                    className={`text-xs px-2 py-1 rounded-full ${task.priority === "High" ? "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300" : task.priority === "Medium" ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300" : "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300"}`}
                  >
                    {task.priority}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Documents</CardTitle>
            <CardDescription>Your recently accessed documents</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentDocuments.map((doc) => (
                <div key={doc.id} className="flex items-center">
                  <div className="mr-4 rounded-full p-2 bg-muted">
                    <FileTextIcon className="h-4 w-4" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">{doc.title}</p>
                    <p className="text-sm text-muted-foreground">Last edited: {doc.lastEdited}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

const recentActivities = [
  {
    id: 1,
    title: "Updated profile information",
    time: "2 hours ago",
    icon: UserIcon,
  },
  {
    id: 2,
    title: "Added new document",
    time: "Yesterday at 4:30 PM",
    icon: FileTextIcon,
  },
  {
    id: 3,
    title: "Completed 3 tasks",
    time: "Yesterday at 2:15 PM",
    icon: CalendarIcon,
  },
  {
    id: 4,
    title: "Viewed analytics dashboard",
    time: "2 days ago",
    icon: BarChart3Icon,
  },
]

const upcomingTasks = [
  {
    id: 1,
    title: "Complete project proposal",
    dueDate: "Today, 5:00 PM",
    priority: "High",
  },
  {
    id: 2,
    title: "Review quarterly report",
    dueDate: "Tomorrow, 10:00 AM",
    priority: "Medium",
  },
  {
    id: 3,
    title: "Schedule team meeting",
    dueDate: "Apr 3, 2:00 PM",
    priority: "Low",
  },
  {
    id: 4,
    title: "Update documentation",
    dueDate: "Apr 5, 12:00 PM",
    priority: "Medium",
  },
]

const recentDocuments = [
  {
    id: 1,
    title: "Project Proposal.docx",
    lastEdited: "Today at 10:30 AM",
  },
  {
    id: 2,
    title: "Budget Spreadsheet.xlsx",
    lastEdited: "Yesterday at 2:45 PM",
  },
  {
    id: 3,
    title: "Meeting Notes.pdf",
    lastEdited: "Mar 30, 2025",
  },
  {
    id: 4,
    title: "Research Findings.pptx",
    lastEdited: "Mar 28, 2025",
  },
]