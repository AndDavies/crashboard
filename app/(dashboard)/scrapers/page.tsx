import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/utils"

// Mock data for scrapers
const scrapers = [
  {
    id: "1",
    name: "E-commerce Product Scraper",
    description: "Extracts product data from major e-commerce sites",
    status: "active",
    lastRun: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    schedule: "Daily at 2:00 AM",
    target: "amazon.com, walmart.com",
  },
  {
    id: "2",
    name: "News Aggregator",
    description: "Collects news articles from various sources",
    status: "active",
    lastRun: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
    schedule: "Every 6 hours",
    target: "news sites",
  },
  {
    id: "3",
    name: "Social Media Monitor",
    description: "Tracks mentions and engagement on social platforms",
    status: "paused",
    lastRun: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), // 3 days ago
    schedule: "Hourly",
    target: "twitter.com, instagram.com",
  },
  {
    id: "4",
    name: "Competitor Price Tracker",
    description: "Monitors competitor pricing changes",
    status: "active",
    lastRun: new Date(Date.now() - 1000 * 60 * 60 * 12), // 12 hours ago
    schedule: "Twice daily",
    target: "competitor websites",
  },
  {
    id: "5",
    name: "Job Listings Collector",
    description: "Gathers job postings from career sites",
    status: "error",
    lastRun: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
    schedule: "Daily at 8:00 AM",
    target: "job boards",
  },
]

export default function ScrapersPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Scrapers</h2>
          <p className="text-muted-foreground">Manage your web scrapers and data collection tools</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New Scraper
        </Button>
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All Scrapers</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="paused">Paused</TabsTrigger>
          <TabsTrigger value="error">Error</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {scrapers.map((scraper) => (
              <Card key={scraper.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base font-medium">{scraper.name}</CardTitle>
                    <StatusBadge status={scraper.status} />
                  </div>
                  <CardDescription>{scraper.description}</CardDescription>
                </CardHeader>
                <CardContent className="pb-2">
                  <div className="grid gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Schedule:</span>
                      <span>{scraper.schedule}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Target:</span>
                      <span>{scraper.target}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last Run:</span>
                      <span>{formatDate(scraper.lastRun)}</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between">
                  <Button variant="outline" size="sm">
                    View Details
                  </Button>
                  <Button size="sm">Run Now</Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="active" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {scrapers
              .filter((scraper) => scraper.status === "active")
              .map((scraper) => (
                <Card key={scraper.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base font-medium">{scraper.name}</CardTitle>
                      <StatusBadge status={scraper.status} />
                    </div>
                    <CardDescription>{scraper.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-2">
                    <div className="grid gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Schedule:</span>
                        <span>{scraper.schedule}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Target:</span>
                        <span>{scraper.target}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Last Run:</span>
                        <span>{formatDate(scraper.lastRun)}</span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-between">
                    <Button variant="outline" size="sm">
                      View Details
                    </Button>
                    <Button size="sm">Run Now</Button>
                  </CardFooter>
                </Card>
              ))}
          </div>
        </TabsContent>

        {/* Similar content for other tabs */}
        <TabsContent value="paused" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {scrapers
              .filter((scraper) => scraper.status === "paused")
              .map((scraper) => (
                <Card key={scraper.id}>
                  {/* Card content similar to above */}
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base font-medium">{scraper.name}</CardTitle>
                      <StatusBadge status={scraper.status} />
                    </div>
                    <CardDescription>{scraper.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-2">
                    <div className="grid gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Schedule:</span>
                        <span>{scraper.schedule}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Target:</span>
                        <span>{scraper.target}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Last Run:</span>
                        <span>{formatDate(scraper.lastRun)}</span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-between">
                    <Button variant="outline" size="sm">
                      View Details
                    </Button>
                    <Button size="sm">Resume</Button>
                  </CardFooter>
                </Card>
              ))}
          </div>
        </TabsContent>

        <TabsContent value="error" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {scrapers
              .filter((scraper) => scraper.status === "error")
              .map((scraper) => (
                <Card key={scraper.id}>
                  {/* Card content similar to above */}
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base font-medium">{scraper.name}</CardTitle>
                      <StatusBadge status={scraper.status} />
                    </div>
                    <CardDescription>{scraper.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-2">
                    <div className="grid gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Schedule:</span>
                        <span>{scraper.schedule}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Target:</span>
                        <span>{scraper.target}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Last Run:</span>
                        <span>{formatDate(scraper.lastRun)}</span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-between">
                    <Button variant="outline" size="sm">
                      View Details
                    </Button>
                    <Button size="sm" variant="destructive">
                      Fix Error
                    </Button>
                  </CardFooter>
                </Card>
              ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Helper component for status badges
function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "active":
      return <Badge className="bg-green-500/15 text-green-600 hover:bg-green-500/25">Active</Badge>
    case "paused":
      return <Badge className="bg-yellow-500/15 text-yellow-600 hover:bg-yellow-500/25">Paused</Badge>
    case "error":
      return <Badge className="bg-red-500/15 text-red-600 hover:bg-red-500/25">Error</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

