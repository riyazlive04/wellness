import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Search, Filter, MessageCircle, Plus, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { PostCard } from "@/components/community/PostCard";
import { PostComposer } from "@/components/community/PostComposer";
import { PostDetailModal } from "@/components/community/PostDetailModal";
import { MemberProfileModal } from "@/components/community/MemberProfileModal";
import { ReportDialog } from "@/components/community/ReportDialog";
import { CommunityGuidelinesModal } from "@/components/community/CommunityGuidelinesModal";
import { GroupCard } from "@/components/community/GroupCard";
import { MessagesPanel } from "@/components/community/MessagesPanel";
import { CommunityNotifications } from "@/components/community/CommunityNotifications";
import { CreateGroupModal } from "@/components/community/CreateGroupModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  CommunityPost,
  CommunityGroup,
  fetchPosts,
  createPost,
  createComment,
  toggleReaction,
  fetchGroups,
  joinGroup,
  leaveGroup,
  deletePost,
  deleteGroup,
} from "@/lib/community";

export default function Community() {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();

  const [client, setClient] = useState<any>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("feed");
  const [selectedGroup, setSelectedGroup] = useState<CommunityGroup | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Modals
  const [showGuidelines, setShowGuidelines] = useState(false);
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{ type: "post" | "comment" | "user"; id: string } | null>(null);
  const [showMessages, setShowMessages] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [postToDelete, setPostToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (user) {
      if (userRole !== 'admin' && userRole !== 'manager') {
        loadClientData();
      } else {
        // Admins and Managers should also have a client profile for posting
        loadClientData();
        loadPosts();
        loadGroups();
      }
    }
  }, [user, userRole]);

  useEffect(() => {
    if (client) {
      loadPosts();
      loadGroups();

      // Check if user needs to accept guidelines
      console.log("Checking community guidelines for client:", client.id, "Accepted at:", client.community_terms_accepted_at);
      if (!client.community_terms_accepted_at) {
        console.log("Guidelines not accepted, showing modal.");
        setShowGuidelines(true);
      } else {
        console.log("Guidelines already accepted.");
      }
    }
  }, [client]);

  // Reload posts when tag or group changes
  useEffect(() => {
    if (client || userRole === 'admin' || userRole === 'manager') {
      loadPosts();
    }
  }, [selectedGroup, selectedTag]);

  const loadClientData = async () => {
    try {
      // Try to find existing client profile
      const { data, error: selectError } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", user?.id)
        .maybeSingle();

      if (selectError) {
        console.error("Select client error:", selectError);
      }

      if (data) {

        setClient(data);
      } else if ((userRole === 'admin' || userRole === 'manager') && user) {
        // Auto-create profile for admin/manager if missing

        const { data: newAdmin, error: createError } = await supabase
          .from("clients")
          .upsert({
            user_id: user.id,
            email: user.email || "admin@example.com",
            name: userRole === 'admin' ? "Admin" : "Manager",
            display_name: userRole === 'admin' ? "Admin" : "Manager",
            phone: "0000000000",
            program_type: 'general_wellness',
            service_type: 'hundred_days',
            status: 'active'
          } as any, { onConflict: 'user_id' })
          .select()
          .maybeSingle();

        if (createError) {
          console.error("Community: Failed to create admin profile:", createError);
          toast.error(`Could not initialize admin profile: ${createError.message}`);
        } else if (newAdmin) {

          setClient(newAdmin);
          toast.success(`${userRole === 'admin' ? 'Admin' : 'Manager'} profile initialized`);
        } else {
          // Final fallback - try one more direct select to handle RLS race conditions
          const { data: retryData } = await supabase
            .from("clients")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();

          if (retryData) {
            setClient(retryData);
          } else {

            toast.error("Profile initialization failed. Some features may be limited.");
          }
        }
      }
    } catch (error) {
      console.error("Error loading client:", error);
    }
  };

  const loadPosts = async () => {
    setIsLoading(true);
    try {
      const { posts: data } = await fetchPosts({
        clientId: client?.id,
        search: searchQuery || undefined,
        groupId: selectedGroup?.id,
        tag: selectedTag || undefined,
      });
      setPosts(data);
    } catch (error) {
      console.error("Failed to load posts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadGroups = async () => {
    try {
      const data = await fetchGroups(client?.id);
      setGroups(data);
    } catch (error) {
      console.error("Failed to load groups:", error);
    }
  };

  const handleCreatePost = async (data: {
    content: string;
    title?: string;
    tags: string[];
    mediaUrls: string[];
    attachments: { name: string; url: string; type: string }[];
  }) => {
    if (!client?.id) {
      toast.error("You must have a valid profile to post");
      return;
    }

    try {
      const post = await createPost({
        clientId: client.id,
        displayName: client.display_name || client.name,
        serviceType: (userRole === 'admin' || userRole === 'manager') ? userRole : (client.service_type || client.program_type),
        content: data.content,
        title: data.title,
        tags: data.tags,
        mediaUrls: data.mediaUrls,
        attachments: data.attachments,
        groupId: selectedGroup?.id,
        authorRole: userRole as 'admin' | 'client' | 'manager',
      });

      // Force update state
      setPosts((prev) => [post, ...prev]);
      toast.success("Post created!");
    } catch (error: any) {
      console.error("Failed to create post:", error);
      toast.error(error.message || "Failed to create post");
    }
  };

  const handleLikePost = async (postId: string) => {
    if (!client) return;

    const { added } = await toggleReaction(client.id, "post", postId, "like");

    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
            ...p,
            likes_count: added ? p.likes_count + 1 : p.likes_count - 1,
            user_reaction: added ? "like" : null,
          }
          : p
      )
    );
  };

  const handleComment = async (postId: string, content: string) => {
    if (!client) return;

    await createComment({
      postId,
      clientId: client.id,
      displayName: client.display_name || client.name,
      serviceType: client.service_type,
      authorRole: userRole as 'admin' | 'client' | 'manager',
      content,
    });

    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p
      )
    );
  };

  const handleDeletePost = (postId: string) => {
    setPostToDelete(postId);
  };

  const confirmDeletePost = async () => {
    if (!postToDelete) return;

    setIsDeleting(true);
    try {
      await deletePost(postToDelete, client?.id || "admin");
      setPosts((prev) => prev.filter(p => p.id !== postToDelete));
      toast.success("Post deleted");
      setPostToDelete(null);
    } catch (error) {
      toast.error("Failed to delete post");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleJoinGroup = async (groupId: string) => {
    if (!client) return;

    try {
      await joinGroup(groupId, client.id);
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId ? { ...g, is_member: true, member_count: g.member_count + 1 } : g
        )
      );
      toast.success("Joined group!");
    } catch (error: any) {
      toast.error("Failed to join group");
    }
  };

  const handleLeaveGroup = async (groupId: string) => {
    if (!client) return;

    try {
      await leaveGroup(groupId, client.id);
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId ? { ...g, is_member: false, member_count: g.member_count - 1 } : g
        )
      );
      toast.success("Left group");
    } catch (error: any) {
      toast.error("Failed to leave group");
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      await deleteGroup(groupId);
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      toast.success("Group deleted");
      if (selectedGroup?.id === groupId) {
        setSelectedGroup(null);
      }
    } catch (error) {
      console.error("Failed to delete group:", error);
      toast.error("Failed to delete group");
    }
  };

  if (!user) {
    return (
      <div className="container mx-auto py-8 text-center">
        <p>Please log in to access the community.</p>
        <Button onClick={() => navigate("/auth")} className="mt-4">
          Log In
        </Button>
      </div>
    );
  }

  // Clear group selection when tab changes
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === 'feed') {
      setSelectedGroup(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold">Community</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(userRole === 'admin' ? '/admin' : '/dashboard')}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Home
              </Button>
              {client && (
                <CommunityNotifications
                  clientId={client.id}
                  onNotificationClick={(n) => {
                    if (n.type === "dm") setShowMessages(true);
                    else if (n.payload?.post_id) {
                      const post = posts.find((p) => p.id === n.payload.post_id);
                      if (post) setSelectedPost(post);
                    }
                  }}
                />
              )}
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowMessages(true)}
              >
                <MessageCircle className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-4">
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList>
                <TabsTrigger value="feed">Feed</TabsTrigger>
                <TabsTrigger value="groups">Groups</TabsTrigger>
              </TabsList>

              <TabsContent value="feed" className="space-y-4 mt-4">
                {/* Search & Filter */}
                <div className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search posts..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && loadPosts()}
                      className="pl-10"
                    />
                  </div>
                  {selectedTag && (
                    <Button variant="secondary" size="sm" onClick={() => setSelectedTag(null)}>
                      #{selectedTag} <span className="ml-2">✕</span>
                    </Button>
                  )}
                  <Button variant="outline" size="icon">
                    <Filter className="h-4 w-4" />
                  </Button>
                </div>

                {/* Post composer */}
                {client && (
                  <PostComposer
                    clientId={client.id}
                    displayName={client.display_name || client.name}
                    serviceType={(userRole === 'admin' || userRole === 'manager') ? userRole : (client.service_type || client.program_type)}
                    onPost={handleCreatePost}
                  />
                )}

                {/* Posts feed */}
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : posts.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <p className="text-muted-foreground">No posts yet. Be the first to share!</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {posts.map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        currentClientId={client?.id}
                        isAdmin={userRole === 'admin' || userRole === 'manager'}
                        onLike={handleLikePost}
                        onComment={(postId) => {
                          const post = posts.find((p) => p.id === postId);
                          if (post) setSelectedPost(post);
                        }}
                        onReport={(postId) => setReportTarget({ type: "post", id: postId })}
                        onDelete={handleDeletePost}
                        onAuthorClick={setSelectedProfileId}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="groups" className="mt-4">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold">Community Groups</h2>
                  {(userRole === 'admin' || userRole === 'manager') && (
                    <Button onClick={() => setShowCreateGroup(true)} size="sm">
                      <Plus className="mr-2 h-4 w-4" /> Create Group
                    </Button>
                  )}
                </div>

                {selectedGroup ? (
                  <div className="space-y-4">
                    <Button
                      variant="ghost"
                      className="gap-2 pl-0 hover:bg-transparent"
                      onClick={() => setSelectedGroup(null)}
                    >
                      <ArrowLeft className="h-4 w-4" /> Back to Groups
                    </Button>

                    <Card>
                      <CardHeader>
                        <CardTitle>{selectedGroup.name}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {selectedGroup.cover_image_url && (
                          <img
                            src={selectedGroup.cover_image_url}
                            alt={selectedGroup.name}
                            className="w-full h-48 object-cover rounded-md mb-4"
                          />
                        )}
                        <p className="text-muted-foreground mb-4">{selectedGroup.description}</p>
                        <div className="flex items-center gap-4 text-sm">
                          <span>{selectedGroup.member_count} members</span>
                          {!selectedGroup.is_member ? (
                            <Button size="sm" onClick={() => handleJoinGroup(selectedGroup.id)}>Join Group</Button>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => handleLeaveGroup(selectedGroup.id)}>Leave Group</Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Group Feed */}
                    <div className="space-y-4">
                      {client && selectedGroup.is_member && (
                        <PostComposer
                          clientId={client.id}
                          displayName={client.display_name || client.name}
                          serviceType={(userRole === 'admin' || userRole === 'manager') ? userRole : (client.service_type || client.program_type)}
                          onPost={handleCreatePost}
                          groupId={selectedGroup.id}
                        />
                      )}

                      {isLoading ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                      ) : posts.length === 0 ? (
                        <Card>
                          <CardContent className="py-8 text-center">
                            <p className="text-muted-foreground">No posts in this group yet.</p>
                          </CardContent>
                        </Card>
                      ) : (
                        posts.map((post) => (
                          <PostCard
                            key={post.id}
                            post={post}
                            currentClientId={client?.id}
                            isAdmin={userRole === 'admin' || userRole === 'manager'}
                            onLike={handleLikePost}
                            onComment={(postId) => {
                              const post = posts.find((p) => p.id === postId);
                              if (post) setSelectedPost(post);
                            }}
                            onReport={(postId) => setReportTarget({ type: "post", id: postId })}
                            onDelete={handleDeletePost}
                            onAuthorClick={setSelectedProfileId}
                          />
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {groups.map((group) => (
                      <GroupCard
                        key={group.id}
                        group={group}
                        onJoin={handleJoinGroup}
                        onLeave={handleLeaveGroup}
                        isAdmin={userRole === 'admin' || userRole === 'manager'}
                        onDelete={handleDeleteGroup}
                        onClick={(groupId) => {
                          const group = groups.find(g => g.id === groupId);
                          if (group) setSelectedGroup(group);
                        }}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {client && showMessages && (
              <MessagesPanel
                clientId={client.id}
                displayName={client.display_name || client.name}
                onClose={() => setShowMessages(false)}
              />
            )}

            {!showMessages && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Popular Tags</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {["weightloss", "healthyeating", "motivation", "recipes", "progress"].map((tag) => (
                    <Button
                      key={tag}
                      variant={selectedTag === tag ? "default" : "secondary"}
                      size="sm"
                      onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                    >
                      #{tag}
                    </Button>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {client && (
        <>
          <CommunityGuidelinesModal
            open={showGuidelines}
            onAccept={(updatedClient) => {
              setShowGuidelines(false);
              if (updatedClient) {
                console.log("Updating client state from modal response");
                setClient(updatedClient);
              } else {
                console.log("No data returned, applying optimistic update to prevent loop");
                setClient((prev: any) => ({
                  ...prev,
                  community_terms_accepted_at: new Date().toISOString()
                }));
                // Optionally reload in background but we trust the optimistic update for UI
              }
            }}
            clientId={client.id}
          />

          <PostDetailModal
            post={selectedPost}
            open={!!selectedPost}
            onClose={() => setSelectedPost(null)}
            clientId={client.id}
            displayName={client?.display_name || client?.name}
            serviceType={client?.service_type}
            userRole={userRole as 'admin' | 'client' | 'manager'}
            onComment={handleComment}
            onLikeComment={() => { }}
            onAuthorClick={setSelectedProfileId}
          />

          <MemberProfileModal
            clientId={selectedProfileId}
            open={!!selectedProfileId}
            onClose={() => setSelectedProfileId(null)}
            currentClientId={client.id}
            onStartDM={() => setShowMessages(true)}
          />

          {reportTarget && (
            <ReportDialog
              open={!!reportTarget}
              onClose={() => setReportTarget(null)}
              targetType={reportTarget.type}
              targetId={reportTarget.id}
              reporterClientId={client.id}
            />
          )}

          <CreateGroupModal
            open={showCreateGroup}
            onClose={() => setShowCreateGroup(false)}
            onSuccess={(newGroup) => {
              setGroups(prev => [newGroup, ...prev]);
              setSelectedGroup(newGroup);
            }}
            ownerClientId={client.id}
          />
        </>
      )}

      <AlertDialog open={!!postToDelete} onOpenChange={(open) => !open && setPostToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently remove your post from the community.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeletePost}
              disabled={isDeleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
