import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'

import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import HtmlWorker from 'monaco-editor/language/html/html.worker.js?worker'
// Bundle Monaco's real Python grammar locally; no CDN download is needed.
import { conf, language } from 'monaco-editor/languages/definitions/python/python.js'
import { registerSchemaLanguage } from './schema-language.ts'

self.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    return label === 'html' ? new HtmlWorker() : new EditorWorker()
  },
}

registerSchemaLanguage(monaco, conf, language)
loader.config({ monaco })
