"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppStore } from "@/store/app-store";
import { getElectronAPI } from "@/lib/electron";
import { initializeProject } from "@/lib/project-init";
import {
  FolderOpen,
  Plus,
  Cpu,
  Folder,
  Clock,
  Sparkles,
  MessageSquare,
  ChevronDown,
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export function WelcomeView() {
  const { projects, addProject, setCurrentProject, setCurrentView } =
    useAppStore();
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectPath, setNewProjectPath] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [showInitDialog, setShowInitDialog] = useState(false);
  const [initStatus, setInitStatus] = useState<{
    isNewProject: boolean;
    createdFiles: string[];
    projectName: string;
    projectPath: string;
  } | null>(null);

  /**
   * Initialize project and optionally kick off project analysis agent
   */
  const initializeAndOpenProject = useCallback(async (path: string, name: string) => {
    setIsOpening(true);
    try {
      // Initialize the .automaker directory structure
      const initResult = await initializeProject(path);

      if (!initResult.success) {
        toast.error("Failed to initialize project", {
          description: initResult.error || "Unknown error occurred",
        });
        return;
      }

      const project = {
        id: `project-${Date.now()}`,
        name,
        path,
        lastOpened: new Date().toISOString(),
      };

      addProject(project);
      setCurrentProject(project);

      // Show initialization dialog if files were created
      if (initResult.createdFiles && initResult.createdFiles.length > 0) {
        setInitStatus({
          isNewProject: initResult.isNewProject,
          createdFiles: initResult.createdFiles,
          projectName: name,
          projectPath: path,
        });
        setShowInitDialog(true);

        // TODO: Kick off agent to analyze the project and update app_spec.txt
        // This will be implemented in a future iteration with the auto-mode service
        console.log("[Welcome] Project initialized, created files:", initResult.createdFiles);
      } else {
        toast.success("Project opened", {
          description: `Opened ${name}`,
        });
      }
    } catch (error) {
      console.error("[Welcome] Failed to open project:", error);
      toast.error("Failed to open project", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsOpening(false);
    }
  }, [addProject, setCurrentProject]);

  const handleOpenProject = useCallback(async () => {
    const api = getElectronAPI();
    const result = await api.openDirectory();

    if (!result.canceled && result.filePaths[0]) {
      const path = result.filePaths[0];
      const name = path.split("/").pop() || "Untitled Project";
      await initializeAndOpenProject(path, name);
    }
  }, [initializeAndOpenProject]);

  /**
   * Handle clicking on a recent project
   */
  const handleRecentProjectClick = useCallback(async (project: { id: string; name: string; path: string }) => {
    await initializeAndOpenProject(project.path, project.name);
  }, [initializeAndOpenProject]);

  const handleNewProject = () => {
    setNewProjectName("");
    setNewProjectPath("");
    setShowNewProjectDialog(true);
  };

  const handleInteractiveMode = () => {
    setCurrentView("interview");
  };

  const handleSelectDirectory = async () => {
    const api = getElectronAPI();
    const result = await api.openDirectory();

    if (!result.canceled && result.filePaths[0]) {
      setNewProjectPath(result.filePaths[0]);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName || !newProjectPath) return;

    setIsCreating(true);
    try {
      const api = getElectronAPI();
      const projectPath = `${newProjectPath}/${newProjectName}`;

      // Create project directory
      await api.mkdir(projectPath);

      // Initialize .automaker directory with all necessary files
      const initResult = await initializeProject(projectPath);

      if (!initResult.success) {
        toast.error("Failed to initialize project", {
          description: initResult.error || "Unknown error occurred",
        });
        return;
      }

      // Update the app_spec.txt with the project name
      await api.writeFile(
        `${projectPath}/.automaker/app_spec.txt`,
        `<project_specification>
  <project_name>${newProjectName}</project_name>

  <overview>
    Describe your project here. This file will be analyzed by an AI agent
    to understand your project structure and tech stack.
  </overview>

  <technology_stack>
    <!-- The AI agent will fill this in after analyzing your project -->
  </technology_stack>

  <core_capabilities>
    <!-- List core features and capabilities -->
  </core_capabilities>

  <implemented_features>
    <!-- The AI agent will populate this based on code analysis -->
  </implemented_features>
</project_specification>`
      );

      const project = {
        id: `project-${Date.now()}`,
        name: newProjectName,
        path: projectPath,
        lastOpened: new Date().toISOString(),
      };

      addProject(project);
      setCurrentProject(project);
      setShowNewProjectDialog(false);

      toast.success("Project created", {
        description: `Created ${newProjectName} with .automaker directory`,
      });

      // Set init status to show the dialog
      setInitStatus({
        isNewProject: true,
        createdFiles: initResult.createdFiles || [],
        projectName: newProjectName,
        projectPath: projectPath,
      });
      setShowInitDialog(true);
    } catch (error) {
      console.error("Failed to create project:", error);
      toast.error("Failed to create project", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const recentProjects = [...projects]
    .sort((a, b) => {
      const dateA = a.lastOpened ? new Date(a.lastOpened).getTime() : 0;
      const dateB = b.lastOpened ? new Date(b.lastOpened).getTime() : 0;
      return dateB - dateA;
    })
    .slice(0, 5);

  return (
    <div className="flex-1 flex flex-col content-bg" data-testid="welcome-view">
      {/* Header Section */}
      <div className="flex-shrink-0 border-b border-white/10 bg-zinc-950/50 backdrop-blur-md">
        <div className="px-8 py-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 shadow-lg shadow-brand-500/20 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">
                Welcome to Automaker
              </h1>
              <p className="text-sm text-zinc-400">
                Your autonomous AI development studio
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-6xl mx-auto">
          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            <div
              className="group relative overflow-hidden rounded-xl border border-white/10 bg-zinc-900/50 backdrop-blur-md hover:bg-zinc-900/70 hover:border-white/20 transition-all duration-200"
              data-testid="new-project-card"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-brand-500/5 to-purple-600/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="relative p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 shadow-lg shadow-brand-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Plus className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-1">
                      New Project
                    </h3>
                    <p className="text-sm text-zinc-400">
                      Create a new project from scratch with AI-powered
                      development
                    </p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      className="w-full bg-gradient-to-r from-brand-500 to-purple-600 hover:from-brand-600 hover:to-purple-700 text-white border-0"
                      data-testid="create-new-project"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create Project
                      <ChevronDown className="w-4 h-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem
                      onClick={handleNewProject}
                      data-testid="quick-setup-option"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Quick Setup
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleInteractiveMode}
                      data-testid="interactive-mode-option"
                    >
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Interactive Mode
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div
              className="group relative overflow-hidden rounded-xl border border-white/10 bg-zinc-900/50 backdrop-blur-md hover:bg-zinc-900/70 hover:border-white/20 transition-all duration-200 cursor-pointer"
              onClick={handleOpenProject}
              data-testid="open-project-card"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-cyan-600/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="relative p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-lg bg-zinc-800 border border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <FolderOpen className="w-6 h-6 text-zinc-400 group-hover:text-white transition-colors" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-1">
                      Open Project
                    </h3>
                    <p className="text-sm text-zinc-400">
                      Open an existing project folder to continue working
                    </p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/10 hover:border-white/20"
                  data-testid="open-existing-project"
                >
                  <FolderOpen className="w-4 h-4 mr-2" />
                  Browse Folder
                </Button>
              </div>
            </div>
          </div>

          {/* Recent Projects */}
          {recentProjects.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-zinc-400" />
                <h2 className="text-lg font-semibold text-white">
                  Recent Projects
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recentProjects.map((project) => (
                  <div
                    key={project.id}
                    className="group relative overflow-hidden rounded-xl border border-white/10 bg-zinc-900/50 backdrop-blur-md hover:bg-zinc-900/70 hover:border-brand-500/50 transition-all duration-200 cursor-pointer"
                    onClick={() => handleRecentProjectClick(project)}
                    data-testid={`recent-project-${project.id}`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-brand-500/0 to-purple-600/0 group-hover:from-brand-500/5 group-hover:to-purple-600/5 transition-all"></div>
                    <div className="relative p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-white/10 flex items-center justify-center group-hover:border-brand-500/50 transition-colors">
                          <Folder className="w-5 h-5 text-zinc-400 group-hover:text-brand-500 transition-colors" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-white truncate group-hover:text-brand-500 transition-colors">
                            {project.name}
                          </p>
                          <p className="text-xs text-zinc-500 truncate mt-0.5">
                            {project.path}
                          </p>
                          {project.lastOpened && (
                            <p className="text-xs text-zinc-600 mt-1">
                              {new Date(
                                project.lastOpened
                              ).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State for No Projects */}
          {recentProjects.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-zinc-900/50 border border-white/10 flex items-center justify-center mb-4">
                <Sparkles className="w-8 h-8 text-zinc-600" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                No projects yet
              </h3>
              <p className="text-sm text-zinc-400 max-w-md">
                Get started by creating a new project or opening an existing one
              </p>
            </div>
          )}
        </div>
      </div>

      {/* New Project Dialog */}
      <Dialog
        open={showNewProjectDialog}
        onOpenChange={setShowNewProjectDialog}
      >
        <DialogContent
          className="bg-zinc-900 border-white/10"
          data-testid="new-project-dialog"
        >
          <DialogHeader>
            <DialogTitle className="text-white">Create New Project</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Set up a new project directory with initial configuration files.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project-name" className="text-zinc-300">
                Project Name
              </Label>
              <Input
                id="project-name"
                placeholder="my-awesome-project"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="bg-zinc-950/50 border-white/10 text-white placeholder:text-zinc-500"
                data-testid="project-name-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-path" className="text-zinc-300">
                Parent Directory
              </Label>
              <div className="flex gap-2">
                <Input
                  id="project-path"
                  placeholder="/path/to/projects"
                  value={newProjectPath}
                  onChange={(e) => setNewProjectPath(e.target.value)}
                  className="flex-1 bg-zinc-950/50 border-white/10 text-white placeholder:text-zinc-500"
                  data-testid="project-path-input"
                />
                <Button
                  variant="secondary"
                  onClick={handleSelectDirectory}
                  className="bg-white/5 hover:bg-white/10 text-white border border-white/10"
                  data-testid="browse-directory"
                >
                  Browse
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowNewProjectDialog(false)}
              className="text-zinc-400 hover:text-white hover:bg-white/5"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateProject}
              disabled={!newProjectName || !newProjectPath || isCreating}
              className="bg-gradient-to-r from-brand-500 to-purple-600 hover:from-brand-600 hover:to-purple-700 text-white border-0"
              data-testid="confirm-create-project"
            >
              {isCreating ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Project Initialization Dialog */}
      <Dialog open={showInitDialog} onOpenChange={setShowInitDialog}>
        <DialogContent
          className="bg-zinc-900 border-white/10"
          data-testid="project-init-dialog"
        >
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-500" />
              {initStatus?.isNewProject ? "Project Initialized" : "Project Updated"}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              {initStatus?.isNewProject
                ? `Created .automaker directory structure for ${initStatus?.projectName}`
                : `Updated missing files in .automaker for ${initStatus?.projectName}`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <p className="text-sm text-zinc-300 font-medium">Created files:</p>
              <ul className="space-y-1.5">
                {initStatus?.createdFiles.map((file) => (
                  <li
                    key={file}
                    className="flex items-center gap-2 text-sm text-zinc-400"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    <code className="text-xs bg-zinc-800 px-2 py-0.5 rounded">
                      {file}
                    </code>
                  </li>
                ))}
              </ul>
            </div>

            {initStatus?.isNewProject && (
              <div className="mt-4 p-3 rounded-lg bg-zinc-800/50 border border-white/5">
                <p className="text-sm text-zinc-400">
                  <span className="text-brand-400">Tip:</span> Edit the{" "}
                  <code className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded">
                    app_spec.txt
                  </code>{" "}
                  file to describe your project. The AI agent will use this to
                  understand your project structure.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() => setShowInitDialog(false)}
              className="bg-gradient-to-r from-brand-500 to-purple-600 hover:from-brand-600 hover:to-purple-700 text-white border-0"
              data-testid="close-init-dialog"
            >
              Get Started
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Loading overlay when opening project */}
      {isOpening && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          data-testid="project-opening-overlay"
        >
          <div className="flex flex-col items-center gap-3 p-6 rounded-xl bg-zinc-900 border border-white/10">
            <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
            <p className="text-white font-medium">Initializing project...</p>
          </div>
        </div>
      )}
    </div>
  );
}
