"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const schemas_to_dataTypes_1 = require("../../schemas-to-dataTypes");
const security_schemas_to_ms3_1 = require("./security-schemas-to-ms3");
const apro_version_1 = require("../../../apro_version");
const lodash_1 = require("lodash");
const uuid_1 = require("uuid");
class MS3toOAS30toMS3 {
    constructor(oasAPI, loadedSchemas, loadedExamples) {
        this.oasAPI = oasAPI;
        this.loadedSchemas = loadedSchemas;
        this.loadedExamples = loadedExamples;
        this.ms3API = {
            entityTypeName: 'api',
            apro_version: apro_version_1.default,
            settings: {
                title: '',
                version: '',
                baseUri: ''
            },
            examples: [],
            dataTypes: []
        };
    }
    static create(oasAPI, loadedSchemas, loadedExamples) {
        return new MS3toOAS30toMS3(oasAPI, loadedSchemas, loadedExamples);
    }
    convert() {
        this.ms3API.settings = this.convertSettings();
        if (this.oasAPI.components && this.oasAPI.components.securitySchemes) {
            this.ms3API.securitySchemes = security_schemas_to_ms3_1.default(this.oasAPI.components.securitySchemes);
        }
        this.ms3API.resources = this.convertPaths();
        if (this.oasAPI.security) {
            this.ms3API.settings.securedBy = this.getSecuredBy(this.oasAPI.security);
        }
        return this.ms3API;
    }
    getSecuredBy(securitySchemas) {
        return lodash_1.map(securitySchemas, (schema) => {
            const foundSchema = lodash_1.find(this.ms3API.securitySchemes, { name: Object.keys(schema)[0] });
            return foundSchema.__id;
        });
    }
    convertSettings() {
        const info = this.oasAPI.info;
        const settings = {
            title: info.title,
            baseUri: 'http://base.uri',
            version: info.version
        };
        if (this.oasAPI.servers && this.oasAPI.servers.length && this.oasAPI.servers[0].url) {
            settings.baseUri = this.oasAPI.servers[0].url;
        }
        if (info.description)
            settings.description = info.description;
        return settings;
    }
    convertOperations(operations) {
        const methodsKeys = ['get', 'post', 'put', 'delete', 'options', 'head', 'patch'];
        return methodsKeys.reduce((methodsArray, methodKey) => {
            const operation = operations[methodKey];
            if (!operation) {
                methodsArray.push({
                    active: false,
                    name: methodKey.toUpperCase(),
                    description: '',
                    queryParameters: [],
                    headers: [],
                    selectedTraits: [],
                    responses: []
                });
                return methodsArray;
            }
            const method = this.convertOperation(operation, methodKey);
            methodsArray.push(method);
            return methodsArray;
        }, []);
    }
    convertOperation(operation, name) {
        const method = {
            name: name.toUpperCase(),
            active: true
        };
        if (operation.security)
            method.securedBy = this.getSecuredBy(operation.security);
        if (operation.description)
            method.description = operation.description;
        const parameters = this.getParameters(operation.parameters);
        if (parameters.queryParameters)
            method.queryParameters = parameters.queryParameters;
        if (parameters.headers)
            method.headers = parameters.headers;
        if (operation.requestBody)
            method.body = this.convertRequestBody(operation.requestBody);
        if (operation.responses)
            method.responses = this.convertResponses(operation.responses);
        return method;
    }
    convertRequestBody(requestBody) {
        return lodash_1.reduce(requestBody.content, (resultArray, value, key) => {
            const convertedBody = {
                contentType: key
            };
            if (value.schema && value.schema.$ref) {
                const splitArr = value.schema.$ref.split('/');
                const name = splitArr.pop();
                convertedBody.type = this.getRefId(name, 'schemas');
            }
            else if (value.schema) {
                convertedBody.type = uuid_1.v4();
                value.schema.__id = convertedBody.type;
                this.ms3API.dataTypes.push(value.schema);
            }
            if (value.examples && value.examples.$ref) {
                const splitArr = value.examples.$ref.split('/');
                const name = splitArr.pop();
                convertedBody.selectedExamples.push(this.getRefId(name, 'examples'));
            }
            else if (value.examples) {
                convertedBody.selectedExamples = this.convertExamples(value.examples);
            }
            resultArray.push(convertedBody);
            return resultArray;
        }, []);
    }
    /**
     * Get by $ref new or existing id of the included entity in resulting Ms3 API
     */
    getRefId(name, entity) {
        let ID = '';
        if (!this.oasAPI.components || !this.oasAPI.components[entity])
            throw new Error(`Missing ${name} in ${entity} components`);
        this.oasAPI.components[entity] = lodash_1.reduce(this.oasAPI.components[entity], (result, value, key) => {
            if (key == name) {
                if (!value.__id) {
                    value.__id = uuid_1.v4();
                }
                ID = value.__id;
                if (entity == 'schemas')
                    this.getSchemas(value, key);
                if (entity == 'examples')
                    this.getExamples(value, key);
            }
            result[key] = value;
            return result;
        }, {});
        return ID;
    }
    /**
     * Modify given entity and push it to respective collection of resources(dataTypes, examples) on resulting Ms3 API
     */
    getSchemas(data, name) {
        const schema = {};
        data.name = name;
        if (lodash_1.find(this.ms3API.dataTypes, { name }))
            return;
        if (data.$ref) {
            const foundContent = lodash_1.find(this.loadedSchemas, { name }).content;
            const foundSchema = JSON.parse(foundContent)[name];
            delete foundSchema.title;
            foundSchema.name = name;
            schema[name] = foundSchema;
            this.ms3API.dataTypes.push(schemas_to_dataTypes_1.default(schema, data.__id, this.loadedSchemas));
        }
        else {
            schema[name] = data;
            this.ms3API.dataTypes.push(schemas_to_dataTypes_1.default(schema));
        }
    }
    getExamples(data, name) {
        if (lodash_1.find(this.ms3API.examples, { title: name }))
            return;
        let content;
        if (data.externalValue) {
            content = lodash_1.find(this.loadedExamples, { name }).content;
        }
        else {
            content = JSON.stringify(data.value);
        }
        const example = {
            __id: data.__id,
            title: name,
            format: 'json',
            content: content
        };
        this.ms3API.examples.push(example);
    }
    convertResponses(responses) {
        return lodash_1.reduce(responses, (resultArray, value, key) => {
            const convertedResponse = {
                code: key,
                description: value.description,
            };
            if (value.content) {
                convertedResponse.body = this.convertRequestBody(value);
            }
            if (value.headers) {
                const headers = lodash_1.reduce(value.headers, (result, value, key) => {
                    value.name = key;
                    result.push(value);
                    return result;
                }, []);
                if (headers.length) {
                    convertedResponse.headers = this.convertParameters(headers);
                }
            }
            resultArray.push(convertedResponse);
            return resultArray;
        }, []);
    }
    convertExamples(examples) {
        return lodash_1.reduce(examples, (resultArray, value, key) => {
            let ID;
            if (!value.$ref) {
                ID = uuid_1.v4();
                this.ms3API.examples.push({
                    __id: ID,
                    title: key,
                    format: 'json',
                    content: JSON.stringify(value.value)
                });
            }
            else if (value.$ref) {
                const splitArr = value.$ref.split('/');
                const name = splitArr.pop();
                ID = this.getRefId(name, 'examples');
            }
            resultArray.push(ID);
            return resultArray;
        }, []);
    }
    getParameters(parameters) {
        const query = lodash_1.filter(parameters, ['in', 'query']);
        const header = lodash_1.filter(parameters, ['in', 'header']);
        const convertedParameters = {};
        if (query && query.length)
            convertedParameters.queryParameters = this.convertParameters(query);
        if (header && header.length)
            convertedParameters.headers = this.convertParameters(header);
        return convertedParameters;
    }
    convertParameters(parameters) {
        return parameters.map((parameter) => {
            const convertedParameter = {
                displayName: parameter.name,
                type: 'string' // default
            };
            if (parameter.description)
                convertedParameter.description = parameter.description;
            if (parameter.required)
                convertedParameter.required = parameter.required;
            if (parameter.schema) {
                const schema = parameter.schema;
                if (schema.pattern)
                    convertedParameter.pattern = schema.pattern;
                if (schema.default)
                    convertedParameter.default = schema.default;
                if (schema.maxLength)
                    convertedParameter.maxLength = schema.maxLength;
                if (schema.minLength)
                    convertedParameter.minLength = schema.minLength;
                if (schema.minimum)
                    convertedParameter.minimum = schema.minimum;
                if (schema.maximum)
                    convertedParameter.maximum = schema.maximum;
                if (schema.enum)
                    convertedParameter.enum = schema.enum;
                if (schema.type) {
                    if (schema.type == 'array' && schema.items && schema.items.type) {
                        convertedParameter.type = schema.items.type;
                        convertedParameter.repeat = true;
                    }
                    else {
                        convertedParameter.type = schema.type;
                        if (schema.type == 'long' || schema.type == 'float' || schema.type == 'double') {
                            convertedParameter.type = 'number';
                        }
                    }
                }
            }
            return convertedParameter;
        });
    }
    convertPaths() {
        return lodash_1.reduce(this.oasAPI.paths, (resultResources, pathValue, pathKey) => {
            const resource = {
                __id: uuid_1.v4(),
                path: pathKey,
                methods: this.convertOperations(pathValue)
            };
            if (pathValue.description)
                resource.description = pathValue.description;
            if (pathValue.parameters) {
                const uri = lodash_1.filter(pathValue.parameters, ['in', 'path']);
                resource.pathVariables = this.convertParameters(uri);
            }
            resultResources.push(resource);
            return resultResources;
        }, []);
    }
}
function convertOAS30toMS3(oasAPI, loadedSchemas, loadedExamples) {
    return MS3toOAS30toMS3.create(oasAPI, loadedSchemas, loadedExamples).convert();
}
exports.default = convertOAS30toMS3;
//# sourceMappingURL=index.js.map