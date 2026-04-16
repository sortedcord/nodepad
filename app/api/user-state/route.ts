import { z } from "zod"
import { getSessionUser } from "@/lib/server/auth"
import { prisma } from "@/lib/server/prisma"
import { INITIAL_PROJECTS } from "@/lib/initial-data"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const stateSchema = z.object({
  projects: z.array(z.unknown()),
  activeProjectId: z.string().nullable().optional(),
  backupProjects: z.array(z.unknown()).nullable().optional(),
  introSeen: z.boolean().optional(),
})

function normalizeState(raw: { projects?: unknown; activeProjectId?: unknown; backupProjects?: unknown; introSeen?: unknown }) {
  const projects = Array.isArray(raw.projects) ? raw.projects : INITIAL_PROJECTS
  const activeProjectId = typeof raw.activeProjectId === "string"
    ? raw.activeProjectId
    : (projects[0] as any)?.id ?? null
  const backupProjects = Array.isArray(raw.backupProjects) ? raw.backupProjects : projects
  const introSeen = typeof raw.introSeen === "boolean" ? raw.introSeen : false

  return { projects, activeProjectId, backupProjects, introSeen }
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return Response.json({ error: "Unauthorized." }, { status: 401 })
  }

  const state = await prisma.userState.findUnique({
    where: { userId: user.id },
  })

  if (!state) {
    const created = await prisma.userState.create({
      data: {
        userId: user.id,
        projects: INITIAL_PROJECTS,
        activeProjectId: INITIAL_PROJECTS[0]?.id ?? null,
        backupProjects: INITIAL_PROJECTS,
        introSeen: false,
      },
    })
    return Response.json({
      state: {
        projects: created.projects,
        activeProjectId: created.activeProjectId,
        backupProjects: created.backupProjects,
        introSeen: created.introSeen,
      },
    })
  }

  const normalized = normalizeState({
    projects: state.projects,
    activeProjectId: state.activeProjectId ?? undefined,
    backupProjects: state.backupProjects ?? undefined,
    introSeen: state.introSeen,
  })

  return Response.json({ state: normalized })
}

export async function PUT(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return Response.json({ error: "Unauthorized." }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = stateSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Invalid state payload." }, { status: 400 })
  }

  const normalized = normalizeState(parsed.data)

  const state = await prisma.userState.upsert({
    where: { userId: user.id },
    update: {
      projects: normalized.projects,
      activeProjectId: normalized.activeProjectId,
      backupProjects: normalized.backupProjects,
      introSeen: normalized.introSeen,
    },
    create: {
      userId: user.id,
      projects: normalized.projects,
      activeProjectId: normalized.activeProjectId,
      backupProjects: normalized.backupProjects,
      introSeen: normalized.introSeen,
    },
  })

  return Response.json({
    state: {
      projects: state.projects,
      activeProjectId: state.activeProjectId,
      backupProjects: state.backupProjects,
      introSeen: state.introSeen,
    },
  })
}
