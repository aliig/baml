import 'react18-json-view/src/style.css'

import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai'
import { atomFamily, atomWithStorage, unwrap, useAtomCallback } from 'jotai/utils'
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { useCallback, useEffect } from 'react'
import CustomErrorBoundary from '../utils/ErrorFallback'
import { sessionStore } from './JotaiProvider'
import { availableProjectsAtom, projectFamilyAtom, projectFilesAtom, runtimeFamilyAtom } from './baseAtoms'
import type BamlProjectManager from './project_manager'
import type {
  WasmDiagnosticError,
  WasmParam,
  WasmRuntime,
  WasmRuntimeContext,
} from '@gloo-ai/baml-schema-wasm-web/baml_schema_build'

// const wasm = await import("@gloo-ai/baml-schema-wasm-web/baml_schema_build");
// const { WasmProject, WasmRuntime, WasmRuntimeContext, version: RuntimeVersion } = wasm;

const selectedProjectStorageAtom = atomWithStorage<string | null>('selected-project', null, sessionStore)
const selectedFunctionStorageAtom = atomWithStorage<string | null>('selected-function', null, sessionStore)
const envKeyValueStorage = atomWithStorage<[string, string][]>('env-key-values', [], sessionStore)

export const resetEnvKeyValuesAtom = atom(null, (get, set) => {
  set(envKeyValueStorage, [])
})
export const envKeyValuesAtom = atom(
  (get) => {
    return get(envKeyValueStorage).map(([k, v], idx): [string, string, number] => [k, v, idx])
  },
  (
    get,
    set,
    update: // Update value
      | { itemIndex: number; value: string }
      // Update key
      | { itemIndex: number; newKey: string }
      // Remove key
      | { itemIndex: number; remove: true }
      // Insert key
      | {
          itemIndex: null
          key: string
          value?: string
        },
  ) => {
    if (update.itemIndex !== null) {
      const keyValues = [...get(envKeyValueStorage)]
      if ('value' in update) {
        keyValues[update.itemIndex][1] = update.value
      } else if ('newKey' in update) {
        keyValues[update.itemIndex][0] = update.newKey
      } else if ('remove' in update) {
        keyValues.splice(update.itemIndex, 1)
      }
      console.log('Setting env key values', keyValues)
      set(envKeyValueStorage, keyValues)
    } else {
      set(envKeyValueStorage, (prev) => [...prev, [update.key, update.value ?? '']])
    }
  },
)

type Selection = {
  project?: string
  function?: string
  testCase?: string
}

type ASTContextType = {
  projectMangager: BamlProjectManager
  // Things associated with selection
  selected: Selection
}
// const wasm = await import('@gloo-ai/baml-schema-wasm-web')
// const wasm = undefined

const wasmAtomAsync = atom(async () => {
  const wasm = await import('@gloo-ai/baml-schema-wasm-web/baml_schema_build')
  return wasm
})

const wasmAtom = unwrap(wasmAtomAsync)

export const runtimeCtx = atom((get) => {
  const loadedWasm = get(wasmAtom)

  if (loadedWasm === undefined) {
    return null
  }

  const ctx = new loadedWasm.WasmRuntimeContext()
  for (const [key, value] of get(envKeyValuesAtom)) {
    if (value !== null) {
      ctx.set_env(key, value)
    }
  }

  return ctx
})
runtimeCtx.debugLabel = 'runtimeCtx'

const selectedProjectAtom = atom(
  (get) => {
    const allProjects = get(availableProjectsAtom)
    const project = get(selectedProjectStorageAtom)
    const match = allProjects.find((p) => p === project) ?? allProjects.at(0) ?? null
    return match
  },
  (get, set, project: string) => {
    if (project !== null) {
      set(selectedProjectStorageAtom, project)
    }
  },
)

export const selectedFunctionAtom = atom(
  (get) => {
    const functions = get(availableFunctionsAtom)
    const func = get(selectedFunctionStorageAtom)
    const match = functions.find((f) => f.name === func) ?? functions.at(0)
    return match ?? null
  },
  (get, set, func: string) => {
    if (func !== null) {
      set(selectedFunctionStorageAtom, func)
    }
  },
)

const rawSelectedTestCaseAtom = atom<string | null>(null)
export const selectedTestCaseAtom = atom(
  (get) => {
    const func = get(selectedFunctionAtom)
    const testCases = func?.test_cases ?? []
    const testCase = get(rawSelectedTestCaseAtom)
    const match = testCases.find((tc) => tc.name === testCase) ?? testCases.at(0)
    return match ?? null
  },
  (get, set, testCase: string) => {
    set(rawSelectedTestCaseAtom, testCase)
  },
)

const removeProjectAtom = atom(null, (get, set, root_path: string) => {
  set(projectFilesAtom(root_path), {})
  set(projectFamilyAtom(root_path), null)
  set(runtimeFamilyAtom(root_path), {})
  const availableProjects = get(availableProjectsAtom)
  set(
    availableProjectsAtom,
    availableProjects.filter((p) => p !== root_path),
  )
})

type WriteFileParams = {
  reason: string
  root_path: string
  files: { name: string; content: string | undefined }[]
} & (
  | {
      replace_all?: true
    }
  | {
      renames?: { from: string; to: string }[]
    }
)

export const updateFileAtom = atom(null, (get, set, params: WriteFileParams) => {
  const { reason, root_path, files } = params
  const replace_all = 'replace_all' in params
  const renames = 'renames' in params ? params.renames ?? [] : []
  console.debug(`Updating files due to ${reason}: ${files.length} files (${replace_all ? 'replace all' : 'update'})`)
  const _projFiles = get(projectFilesAtom(root_path))
  const filesToDelete = files.filter((f) => f.content === undefined).map((f) => f.name)

  let projFiles = {
    ..._projFiles,
  }
  const filesToModify = files
    .filter((f) => f.content !== undefined)
    .map((f): [string, string] => [f.name, f.content as string])

  renames.forEach(({ from, to }) => {
    if (from in projFiles) {
      projFiles[to] = projFiles[from]
      delete projFiles[from]
      filesToDelete.push(from)
    }
  })

  if (replace_all) {
    for (const file of Object.keys(_projFiles)) {
      if (!filesToDelete.includes(file)) {
        filesToDelete.push(file)
      }
    }
    projFiles = Object.fromEntries(filesToModify)
  }

  let project = get(projectFamilyAtom(root_path))
  const wasm = get(wasmAtom)
  if (project && !replace_all) {
    for (const file of filesToDelete) {
      if (file.startsWith(root_path)) {
        project.update_file(file, undefined)
      }
    }
    for (const [name, content] of filesToModify) {
      if (name.startsWith(root_path)) {
        project.update_file(name, content)
      }
    }
  } else {
    const onlyRelevantFiles = Object.fromEntries(
      Object.entries(projFiles).filter(([name, _]) => name.startsWith(root_path)),
    )
    if (wasm) {
      project = wasm.WasmProject.new(root_path, onlyRelevantFiles)
    }
  }
  let rt: WasmRuntime | undefined = undefined
  let diag: WasmDiagnosticError | undefined = undefined

  const ctx = get(runtimeCtx)
  if (project && wasm && ctx) {
    try {
      rt = project.runtime(ctx)
      diag = project.diagnostics(rt)
    } catch (e) {
      const WasmDiagnosticError = wasm.WasmDiagnosticError
      if (e instanceof Error) {
        console.error(e.message)
      } else if (e instanceof WasmDiagnosticError) {
        diag = e
      } else {
        console.error(e)
      }
    }
  }

  const availableProjects = get(availableProjectsAtom)
  if (!availableProjects.includes(root_path)) {
    set(availableProjectsAtom, [...availableProjects, root_path])
  }

  set(projectFilesAtom(root_path), projFiles)
  set(projectFamilyAtom(root_path), project)
  set(runtimeFamilyAtom(root_path), (prev) => ({
    last_successful_runtime: prev.current_runtime ?? prev.last_successful_runtime,
    current_runtime: rt,
    diagnostics: diag,
  }))
})

export const selectedRuntimeAtom = atom((get) => {
  const project = get(selectedProjectAtom)
  if (!project) {
    return null
  }

  const runtime = get(runtimeFamilyAtom(project))
  if (runtime.current_runtime) return runtime.current_runtime
  if (runtime.last_successful_runtime) return runtime.last_successful_runtime
  return null
})

export const runtimeRequiredEnvVarsAtom = atom((get) => {
  const runtime = get(selectedRuntimeAtom)
  if (!runtime) {
    return []
  }

  return runtime.required_env_vars()
})

const selectedDiagnosticsAtom = atom((get) => {
  const project = get(selectedProjectAtom)
  if (!project) {
    return null
  }

  const runtime = get(runtimeFamilyAtom(project))
  return runtime.diagnostics ?? null
})

export const versionAtom = atom((get) => {
  const wasm = get(wasmAtom)

  if (wasm === undefined) {
    return 'Loading...'
  }

  return wasm.version()
})

export const availableFunctionsAtom = atom((get) => {
  const runtime = get(selectedRuntimeAtom)
  if (!runtime) {
    return []
  }
  const ctx = get(runtimeCtx)
  if (!ctx) {
    return []
  }
  return runtime.list_functions(ctx)
})

export const renderPromptAtom = atom((get) => {
  const runtime = get(selectedRuntimeAtom)
  const func = get(selectedFunctionAtom)
  const test_case = get(selectedTestCaseAtom)
  const ctx = get(runtimeCtx)

  if (!runtime || !func || !test_case || !ctx) {
    return null
  }

  const params = Object.fromEntries(
    test_case.inputs
      .filter((i): i is WasmParam & { value: string } => i.value !== undefined)
      .map((input) => [input.name, JSON.parse(input.value)]),
  )

  try {
    return func.render_prompt(runtime, ctx, params)
  } catch (e) {
    if (e instanceof Error) {
      return e.message
    } else {
      return `${e}`
    }
  }
})

export const diagnositicsAtom = atom((get) => {
  const diagnostics = get(selectedDiagnosticsAtom)
  if (!diagnostics) {
    return []
  }

  return diagnostics.errors()
})

export const numErrorsAtom = atom((get) => {
  const errors = get(diagnositicsAtom)

  const warningCount = errors.filter((e) => e.type === 'warning').length

  return { errors: errors.length - warningCount, warnings: warningCount }
})

const ErrorCount: React.FC = () => {
  const { errors, warnings } = useAtomValue(numErrorsAtom)
  if (errors === 0 && warnings === 0) {
    return (
      <div className='flex flex-row items-center gap-1 text-green-600'>
        <CheckCircle size={12} />
      </div>
    )
  }
  if (errors === 0) {
    return (
      <div className='flex flex-row items-center gap-1 text-yellow-600'>
        {warnings} <AlertTriangle size={12} />
      </div>
    )
  }
  return (
    <div className='flex flex-row items-center gap-1 text-red-600'>
      {errors} <XCircle size={12} /> {warnings} <AlertTriangle size={12} />{' '}
    </div>
  )
}
const createRuntime = (
  wasm: typeof import('@gloo-ai/baml-schema-wasm-web'),
  ctx: WasmRuntimeContext,
  root_path: string,
  project_files: Record<string, string>,
) => {
  const only_project_files = Object.fromEntries(
    Object.entries(project_files).filter(([name, _]) => name.startsWith(root_path)),
  )
  const project = wasm.WasmProject.new(root_path, only_project_files)

  let rt = undefined
  let diag = undefined
  try {
    rt = project.runtime(ctx)
    diag = project.diagnostics(rt)
  } catch (e) {
    const WasmDiagnosticError = wasm.WasmDiagnosticError
    if (e instanceof Error) {
      console.error(e.message)
    } else if (e instanceof WasmDiagnosticError) {
      diag = e
    } else {
      console.error(e)
    }
  }

  return {
    project,
    runtime: rt,
    diagnostics: diag,
  }
}

// We don't use ASTContext.provider because we should the default value of the context
export const EventListener: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const updateFile = useSetAtom(updateFileAtom)
  const removeProject = useSetAtom(removeProjectAtom)
  const availableProjects = useAtomValue(availableProjectsAtom)
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  // const setRuntimeCtx = useSetAtom(runtimeCtxRaw);
  const version = useAtomValue(versionAtom)
  const wasm = useAtomValue(wasmAtom)
  const ctx = useAtomValue(runtimeCtx)

  const createRuntimeCb = useAtomCallback(
    (get, set, wasm: typeof import('@gloo-ai/baml-schema-wasm-web'), ctx: WasmRuntimeContext) => {
      const selectedProject = get(selectedProjectAtom)
      if (!selectedProject) {
        return
      }

      const project_files = get(projectFilesAtom(selectedProject))
      const { project, runtime, diagnostics } = createRuntime(wasm, ctx, selectedProject, project_files)
      set(projectFamilyAtom(selectedProject), project)
      set(runtimeFamilyAtom(selectedProject), {
        last_successful_runtime: undefined,
        current_runtime: runtime,
        diagnostics,
      })
    },
  )

  useEffect(() => {
    if (wasm && ctx) {
      createRuntimeCb(wasm, ctx)
    }
  }, [wasm, ctx])

  useEffect(() => {
    const fn = (
      event: MessageEvent<
        | {
            command: 'modify_file'
            content: {
              root_path: string
              name: string
              content: string | undefined
            }
          }
        | {
            command: 'add_project'
            content: {
              root_path: string
              files: Record<string, string>
            }
          }
        | {
            command: 'remove_project'
            content: {
              root_path: string
            }
          }
      >,
    ) => {
      const { command, content } = event.data

      switch (command) {
        case 'modify_file':
          updateFile({
            reason: 'modify_file',
            root_path: content.root_path,
            files: [{ name: content.name, content: content.content }],
          })
          break
        case 'add_project':
          updateFile({
            reason: 'add_project',
            root_path: content.root_path,
            files: Object.entries(content.files).map(([name, content]) => ({ name, content })),
            replace_all: true,
          })
          break
        case 'remove_project':
          removeProject(content.root_path)
          break
      }
    }

    window.addEventListener('message', fn)

    return () => window.removeEventListener('message', fn)
  })

  return (
    <>
      <div className='absolute flex flex-row gap-2 text-xs right-2 bottom-2'>
        <ErrorCount /> <span>Runtime Version: {version}</span>
      </div>
      {selectedProject === null ? (
        availableProjects.length === 0 ? (
          <div>
            No baml projects loaded yet
            <br />
            Open a baml file or wait for the extension to finish loading!
          </div>
        ) : (
          <div>
            <h1>Projects</h1>
            <div>
              {availableProjects.map((root_dir) => (
                <div key={root_dir}>
                  <VSCodeButton onClick={() => setSelectedProject(root_dir)}>{root_dir}</VSCodeButton>
                </div>
              ))}
            </div>
          </div>
        )
      ) : (
        <CustomErrorBoundary>{children}</CustomErrorBoundary>
      )}
    </>
  )
}
