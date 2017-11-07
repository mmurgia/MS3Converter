import ConvertorInterface from '../../common/convertor-interface';
import { API as MS3, DataType } from '../ms3-v1-api-interface';
import ConvertorOptions, { format } from '../../common/convertor-options-interface';
import { API as OAS, Info } from './../../oas/oas-20-api-interface';
import { convertDataTypesToSchemas, convertExternalDataTypes, convertExternalDataTypesReferences } from './datatypes-to-schemas';
import convertResourcesToPaths from './resources-to-paths';
import convertSecuritySchemes from './security-schemes-to-oas';
import { convertInlineExamples, convertExternalExamples, convertExternalExampleReferences } from './examples-to-oas';
import * as path from 'path';
import { writeFile } from 'fs';
import { promisify } from 'util';
import { promise as MkdirpPromise } from 'mkdirp2';
import * as YAML from 'yamljs';

const writeFilePromise = promisify(writeFile);

interface MS3toOASInterface {
  oasAPI: OAS;
  convert(): Promise<OAS>;
}

interface DataToWrite {
  path: string;
  content?: OAS;
}

export default class MS3toOAS implements MS3toOASInterface, ConvertorInterface {
  oasAPI: OAS;
  externalFiles: any = {
    examples: [],
    dataTypes: []
  };

  constructor(private ms3API: MS3, private options: ConvertorOptions) {}

  convertAPI(): OAS {
    this.oasAPI = {
      openapi: '2.0',
      info: this.convertSettings(),
      paths: {},
      components: {}
    };
    if (this.ms3API.dataTypes) {
      if (this.options.destinationPath) {
        this.externalFiles.dataTypes = this.externalFiles.dataTypes.concat(convertExternalDataTypes(this.ms3API, this.options.destinationPath));
        this.oasAPI.components.schemas = convertExternalDataTypesReferences(this.ms3API);
      }
      else this.oasAPI.components.schemas = convertDataTypesToSchemas(this.ms3API);
    }
    if (this.ms3API.examples) {
      if (this.options.destinationPath) {
        this.externalFiles.examples = this.externalFiles.examples.concat(convertExternalExamples(this.ms3API.examples, this.options.destinationPath));
        this.oasAPI.components.examples = convertExternalExampleReferences(this.ms3API.examples);
      }
      else this.oasAPI.components.examples = convertInlineExamples(this.ms3API.examples);
    }
    if (this.ms3API.securitySchemes) this.oasAPI.components.securitySchemes = convertSecuritySchemes(this.ms3API);
    if (this.ms3API.resources) this.oasAPI.paths = convertResourcesToPaths(this.ms3API);

    return this.oasAPI;
  }

  convertOverlay(): OAS {
    // check for extended project and merge overlay
    return this.oasAPI;
  }

  convertExtension(): OAS {
    // check for extended project and merge extension
    return this.oasAPI;
  }

  async convert(): Promise<OAS> {
    const result: DataToWrite = { path: '' };

    switch (this.ms3API.entityTypeName) {
      case 'api':
        result.content = this.convertAPI();
        break;
      case 'overlay':
        result.content = this.convertOverlay();
        break;
      case 'extension':
        result.content = this.convertExtension();
        break;
      case 'library':
        throw new Error('Library can not be converted to swagger.');
    }

    if (this.options.destinationPath) {
      result.path = `${this.options.destinationPath}api.${this.options.fileFormat == 'json' ? 'json' : 'yaml'}`;
      await this.writeApiToDisc(result);

      if (this.externalFiles.examples.length) {
        await MkdirpPromise(this.options.destinationPath + 'examples/');
        await this.writeExamplesToDisk();
      }

      if (this.externalFiles.dataTypes.length) {
        await MkdirpPromise(this.options.destinationPath + 'schemas/');
        await this.writeDataTypesToDisk();
      }
    }

    return result.content;
  }

  private convertSettings(): Info {
    if (!this.ms3API.settings.title) {
      throw new Error('MS3 API settings must contain title property.');
    }

    const settings: Info = {
      title: this.ms3API.settings.title,
      description: this.ms3API.settings.description || 'API description',
      version: this.ms3API.settings.version || '2.0'
    };

    return settings;
  }

  static getDefaultConfig(): ConvertorOptions {
    return {
      fileFormat: 'json',
      asSingleFile: true
    };
  }

  private async writeApiToDisc(data: DataToWrite) {
    let resultContent;
    if (this.options.fileFormat == 'yaml') {
      resultContent = YAML.stringify(data.content, 2);
    } else {
      resultContent = JSON.stringify(data.content, undefined, 2);
    }
    await writeFilePromise(data.path, resultContent);
  }

  private writeExamplesToDisk() {
    const promisesArray: any = this.externalFiles.examples.map((file: any) => writeFilePromise(file.path, JSON.stringify(file.content, undefined, 2)));
    return Promise.all(promisesArray);
  }

  private writeDataTypesToDisk() {
    const promisesArray: any = this.externalFiles.dataTypes.map((file: any) => writeFilePromise(file.path, JSON.stringify(file.content, undefined, 2)));
    return Promise.all(promisesArray);
  }

  static create(api: MS3, options: ConvertorOptions = this.getDefaultConfig() ) {
    return new MS3toOAS(api, options);
  }
}
