import * as MS3 from './../ms3-v1-api-interface';
import { Schema, SchemaObject } from './../../oas/oas-30-api-interface';
import { DataType, DataTypeObject, DataTypeArray, DataTypePrimitive } from './../ms3-v1-api-interface';
import { find, cloneDeep } from 'lodash';

class ConvertDataTypesToSchemas {
  constructor(private API: MS3.API) {}

  convert(): Schema {
    return this.API.dataTypes.reduce((result: Schema, item: DataType) => {
      const convertedSchema = this.convertSchema(item);
      if (!convertedSchema) return result;
      result[convertedSchema.title] = convertedSchema;
      return result;
    }, {});
  }

  convertExternal(path: string): object[] {
    return this.API.dataTypes.map((item: DataType) => {
      const convertedSchema = this.convertSchema(item);
      return {
        path: `${path}schemas/${item.name}.json`,
        content: {
          [item.name]: convertedSchema
        }
      };
    });
  }

  convertWithReferences(): Schema {
    return this.API.dataTypes.reduce((result: Schema, item: DataType) => {
      if (!this.convertSchema(item)) return result;

      result[item.name] = {
        '$ref': `./schemas/${item.name}.json#${item.name}`
      };

      return result;
    }, {});
  }

  convertType(dataType: DataType | DataTypeObject | DataTypePrimitive | DataTypeArray ) {
    if (dataType.type == 'nil') return null;
    const convertedType = <any> cloneDeep(dataType);
    delete convertedType.fileTypes;

    switch (convertedType.type) {
      case 'number':
        convertedType.type = 'long';
        break;
      case 'datetime':
        convertedType.type = 'dateTime';
        break;
      case 'date-only':
        convertedType.type = 'date';
        break;
    }

    return convertedType;
  }

  convertSchema(schema: DataType): SchemaObject {
    const convertedSchema = <any> cloneDeep(this.convertType(schema)); // TODO: Refactor this temporary hack to satisfy typescript
    if (!convertedSchema) return convertedSchema;

    convertedSchema.title = convertedSchema.name;
    delete convertedSchema.name;
    delete convertedSchema.__id;

    if (convertedSchema.properties && schema.properties.length) {
      convertedSchema.properties = this.convertProperties(convertedSchema.properties);
    }

    if (convertedSchema.items) {
      convertedSchema.items = this.convertArrayItems(convertedSchema.items);
      if (!convertedSchema.items) {
        delete convertedSchema.items;
      }
    }

    return convertedSchema;
  }

  convertArrayItems(data: DataTypeArray) {
    if (data.includes) {
      const name = this.getSchemaName(data.includes);
      if (!name) return null;

      return {'$ref': `#/components/schemas/${name}` };
    }
    return this.convertType(data);

  }

  convertProperties(props: Array<object>): Schema {
    return props.reduce( (resultObject: any, prop: (DataTypeObject | DataTypePrimitive | DataTypeArray)) => {
      if (prop.includes) {
        const dataTypeName = this.getSchemaName(prop.includes);
        if (!dataTypeName) {
          delete prop.includes;
          return resultObject;
        }
        resultObject[dataTypeName] = {
          '$ref': `#/components/schemas/${dataTypeName}`
        };
      } else {
        resultObject[prop.name] = cloneDeep(this.convertType(prop));
        if (!resultObject[prop.name]) {
          delete resultObject[prop.name];
          return resultObject;
        }
        delete resultObject[prop.name].name;
        if (resultObject.properties && resultObject.properties.length) {
          resultObject.properties = this.convertProperties(resultObject.properties);
        }
      }
      return resultObject;
    }, {});
  }

  getSchemaName(id: string): string | null {
    const schema = find(this.API.dataTypes, ['__id', id]);
    return schema.type == 'nil' ? null : schema.name;
  }

  static create(api: MS3.API) {
    return new ConvertDataTypesToSchemas(api);
  }
}

export function convertDataTypesToSchemas(API: MS3.API): Schema {
  return ConvertDataTypesToSchemas.create(API).convert();
}

export function convertExternalSchemas(API: MS3.API, path: string): object[] {
  return ConvertDataTypesToSchemas.create(API).convertExternal(path);
}

export function convertExternalSchemasReferences(API: MS3.API): Schema {
  return ConvertDataTypesToSchemas.create(API).convertWithReferences();
}