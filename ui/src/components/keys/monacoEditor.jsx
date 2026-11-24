import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/editor/editor.api.js';
import 'monaco-editor/language/json/monaco.contribution.js';
import { conf, language } from 'monaco-editor/languages/definitions/yaml/yaml.js';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker.js?worker';

// All editor assets/workers are bundled locally: no CDN or external script load.
globalThis.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    return label === 'json' ? new JsonWorker() : new EditorWorker();
  },
};
loader.config({ monaco });
monaco.languages.register({ id: 'yaml', extensions: ['.yaml', '.yml'] });
monaco.languages.setLanguageConfiguration('yaml', conf);
monaco.languages.setMonarchTokensProvider('yaml', language);

export default Editor;
