import { Code, Database, MoreHorizontal, BugIcon as Spider } from "lucide-react"

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/utils"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

interface Task {
  id: string
  title: string
  description: string
  status: "success" | "warning" | "error" | "pending"
  lastRun: Date
  result: string
  type: "scraper" | "script" | "database"
}

interface TaskCardProps {
  task: Task
}

export function TaskCard({ task }: TaskCardProps) {
  const getStatusColor = (status: Task["status"]) => {
    switch (status) {
      case "success":
        return "bg-green-500/15 text-green-600 hover:bg-green-500/25"
      case "warning":
        return "bg-yellow-500/15 text-yellow-600 hover:bg-yellow-500/25"
      case "error":
        return "bg-red-500/15 text-red-600 hover:bg-red-500/25"
      case "pending":
        return "bg-blue-500/15 text-blue-600 hover:bg-blue-500/25"
    }
  }

  const getTypeIcon = (type: Task["type"]) => {
    switch (type) {
      case "scraper":
        return <Spider className="h-4 w-4" />
      case "script":
        return <Code className="h-4 w-4" />
      case "database":
        return <Database className="h-4 w-4" />
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base font-medium">{task.title}</CardTitle>
          <CardDescription>{task.description}</CardDescription>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>View details</DropdownMenuItem>
            <DropdownMenuItem>Run now</DropdownMenuItem>
            <DropdownMenuItem>Edit</DropdownMenuItem>
            <DropdownMenuItem>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground">{task.result}</div>
      </CardContent>
      <CardFooter className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={getStatusColor(task.status)}>
            {task.status}
          </Badge>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {getTypeIcon(task.type)}
            {task.type}
          </span>
        </div>
        <div className="flex items-center">
          <span className="text-xs text-muted-foreground">Last run: {formatDate(task.lastRun)}</span>
        </div>
      </CardFooter>
    </Card>
  )
}

