import { Activity, ArrowUpRight, Clock, Code, Database, BugIcon as Spider } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { TaskCard } from "@/components/task-card"

// Mock data for task cards
const tasks = [
  {
    id: "1",
    title: "Product Scraper",
    description: "E-commerce product data extraction",
    status: "success",
    lastRun: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    result: "Scraped 1,245 products successfully",
    type: "scraper",
  },
  {
    id: "2",
    title: "Content Updater",
    description: "Website content automation",
    status: "warning",
    lastRun: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
    result: "Updated 32 pages with warnings",
    type: "script",
  },
  {
    id: "3",
    title: "SEO Analyzer",
    description: "Website SEO performance tracking",
    status: "error",
    lastRun: new Date(Date.now() - 1000 * 60 * 60 * 48), // 2 days ago
    result: "Failed to connect to API endpoint",
    type: "script",
  },
  {
    id: "4",
    title: "Database Backup",
    description: "Automated database backup",
    status: "success",
    lastRun: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
    result: "Backup completed (245MB)",
    type: "database",
  },
  {
    id: "5",
    title: "News Aggregator",
    description: "Industry news collection",
    status: "success",
    lastRun: new Date(Date.now() - 1000 * 60 * 120), // 2 hours ago
    result: "Collected 78 new articles",
    type: "scraper",
  },
  {
    id: "6",
    title: "Log Analyzer",
    description: "Server log analysis",
    status: "pending",
    lastRun: new Date(Date.now() - 1000 * 60 * 60 * 12), // 12 hours ago
    result: "Scheduled for next run",
    type: "script",
  },
]

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard - For a small change</h2>
          <p className="text-muted-foreground">Monitor and manage your automated tasks</p>
        </div>
        <div className="flex items-center gap-2">
          <Button>
            <Clock className="mr-2 h-4 w-4" />
            Schedule Task
          </Button>
          <Button variant="outline">
            <Activity className="mr-2 h-4 w-4" />
            View Activity
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Scrapers</CardTitle>
            <Spider className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
            <p className="text-xs text-muted-foreground">+2 from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Scripts</CardTitle>
            <Code className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">24</div>
            <p className="text-xs text-muted-foreground">+4 from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Database Operations</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">8</div>
            <p className="text-xs text-muted-foreground">+1 from last month</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Recent Tasks</h3>
          <Button variant="ghost" size="sm" className="gap-1">
            View All
            <ArrowUpRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      </div>
    </div>
  )
}

