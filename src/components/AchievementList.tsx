import { useState, useMemo } from "react";
import { AchievementBadge } from "./AchievementBadge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search } from "lucide-react";

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon_name: string;
  category: string;
  target_value: number;
}

interface AchievementListProps {
  achievements: Achievement[];
  earnedAchievements: Array<{
    achievement_id: string;
    earned_at: string;
  }>;
  progress: Array<{
    achievement_id: string;
    current_value: number;
  }>;
}

export function AchievementList({
  achievements,
  earnedAchievements,
  progress,
}: AchievementListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<string>("all");

  const earnedIds = new Set(earnedAchievements.map((a) => a.achievement_id));
  const progressMap = new Map(progress.map((p) => [p.achievement_id, p]));
  const earnedMap = new Map(earnedAchievements.map((a) => [a.achievement_id, a]));

  const filteredAchievements = useMemo(() => {
    let filtered = achievements;

    // Filter by tab
    if (filterTab === "earned") {
      filtered = filtered.filter((a) => earnedIds.has(a.id));
    } else if (filterTab === "in-progress") {
      filtered = filtered.filter((a) => !earnedIds.has(a.id) && progressMap.has(a.id));
    } else if (filterTab !== "all") {
      // Category filter strategy: If tab is 'streak' match strictly, else try generic
      filtered = filtered.filter((a) => a.category === filterTab);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.title.toLowerCase().includes(query) ||
          a.description.toLowerCase().includes(query)
      );
    }

    // Sort: earned first, then by progress percent, then by target value (difficulty)
    return filtered.sort((a, b) => {
      const aEarned = earnedIds.has(a.id);
      const bEarned = earnedIds.has(b.id);

      if (aEarned && !bEarned) return -1;
      if (!aEarned && bEarned) return 1;

      const aProgress = progressMap.get(a.id);
      const bProgress = progressMap.get(b.id);

      if (aProgress && bProgress) {
        const aPercent = (aProgress.current_value / a.target_value);
        const bPercent = (bProgress.current_value / b.target_value);
        return bPercent - aPercent;
      }

      // Default: easier (lower target) first? Or harder first?
      // Let's go harder first for aspiration, or easier for momentum.
      // Let's do ascending target value (easier first).
      return a.target_value - b.target_value;
    });
  }, [achievements, filterTab, searchQuery, earnedIds, progressMap]);

  const earnedCount = achievements.filter((a) => earnedIds.has(a.id)).length;
  // Points removed, so removing Total Points calc or replacing with simple count

  return (
    <div className="space-y-6">
      {/* Stats Header */}
      <div className="flex gap-4 flex-wrap">
        <div className="bg-primary/10 rounded-lg p-4 flex-1 min-w-[200px] flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Unlocked</p>
            <p className="text-2xl font-bold">
              {earnedCount} / {achievements.length}
            </p>
          </div>
          <div className="h-10 w-10 bg-primary/20 rounded-full flex items-center justify-center text-primary">
            <span role="img" aria-label="trophy">🏆</span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search achievements..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Filters */}
      <Tabs value={filterTab} onValueChange={setFilterTab}>
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-6 h-auto gap-2 bg-transparent p-0">
          <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground border">All</TabsTrigger>
          <TabsTrigger value="earned" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground border">Earned</TabsTrigger>
          <TabsTrigger value="streak" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground border">Streaks</TabsTrigger>
          <TabsTrigger value="meal" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground border">Food</TabsTrigger>
          <TabsTrigger value="water" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground border">Water</TabsTrigger>
          <TabsTrigger value="activity" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground border">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value={filterTab} className="mt-6">
          {filteredAchievements.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
              <p>No achievements found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAchievements.map((achievement) => (
                <AchievementBadge
                  key={achievement.id}
                  achievement={achievement}
                  earned={earnedIds.has(achievement.id)}
                  earnedAt={earnedMap.get(achievement.id)?.earned_at}
                  progress={progressMap.get(achievement.id)}
                  size="md"
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
