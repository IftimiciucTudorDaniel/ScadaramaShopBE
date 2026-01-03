import {
    dummyPaymentHandler,
    DefaultJobQueuePlugin,
    DefaultSchedulerPlugin,
    DefaultSearchPlugin,
    VendureConfig,
    LanguageCode,
} from '@vendure/core';
import { AutoFacetsPlugin } from './plugins/auto-facets.plugin';
import { defaultEmailHandlers, EmailPlugin, FileBasedTemplateLoader } from '@vendure/email-plugin';
import { AssetServerPlugin } from '@vendure/asset-server-plugin';
import { AdminUiPlugin } from '@vendure/admin-ui-plugin';
import { GraphiqlPlugin } from '@vendure/graphiql-plugin';
import 'dotenv/config';
import path from 'path';

const IS_DEV = process.env.APP_ENV === 'dev';
const serverPort = +process.env.PORT || 3000;

export const config: VendureConfig = {
    apiOptions: {
        port: serverPort,
        adminApiPath: 'admin-api',
        shopApiPath: 'shop-api',
        trustProxy: IS_DEV ? false : 1,
        ...(IS_DEV ? {
            adminApiDebug: true,
            shopApiDebug: true,
        } : {}),
    },
    authOptions: {
        tokenMethod: ['bearer', 'cookie'],
        superadminCredentials: {
            identifier: process.env.SUPERADMIN_USERNAME,
            password: process.env.SUPERADMIN_PASSWORD,
        },
        cookieOptions: {
            secret: process.env.COOKIE_SECRET,
        },
    },
    dbConnectionOptions: {
        type: 'postgres',

        synchronize: false,
        migrations: [path.join(__dirname, './migrations/*.+(js|ts)')],
        logging: false,
        schema: process.env.DB_SCHEMA,
        host: process.env.DATABASE_HOST || 'postgres_db',
        port: Number(process.env.DATABASE_PORT) || 5432,
        username: process.env.DATABASE_USERNAME || 'SCD',
        password: process.env.DATABASE_PASSWORD || 'Scada123!',
        database: process.env.DATABASE_NAME || 'SCD',
    },
    paymentOptions: {
        paymentMethodHandlers: [dummyPaymentHandler],
    },
    customFields: {
        Product: [
            {
                name: 'category',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'Product Category' }],
                description: [{ languageCode: LanguageCode.en, value: 'Main product category' }],
                options: [
                    { value: 'sigurante', label: [{ languageCode: LanguageCode.en, value: 'Circuit Breakers' }] },
                    { value: 'plc', label: [{ languageCode: LanguageCode.en, value: 'PLCs' }] },
                    { value: 'contactoare', label: [{ languageCode: LanguageCode.en, value: 'Contactors' }] },
                    { value: 'automation_server', label: [{ languageCode: LanguageCode.en, value: 'Automation Servers' }] }
                ],
                ui: {
                    tab: '📋 Basic Info'
                }
            },
            {
                name: 'productType',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'Product Type' }],
                description: [{ languageCode: LanguageCode.en, value: '⚠️ Select this first to show relevant properties!' }],
                options: [
                    { value: 'A9D', label: [{ languageCode: LanguageCode.en, value: 'A9D - Circuit Breakers' }] },
                    { value: 'TM100', label: [{ languageCode: LanguageCode.en, value: 'TM100 - Compact PLC' }] },
                    { value: 'TM221', label: [{ languageCode: LanguageCode.en, value: 'TM221 - Logic Controller' }] },
                    { value: 'TM241', label: [{ languageCode: LanguageCode.en, value: 'TM241 - Modicon M241 PLC' }] },
                    { value: 'TM200', label: [{ languageCode: LanguageCode.en, value: 'TM200 - M200 Series PLC' }] },
                    { value: 'LC1D', label: [{ languageCode: LanguageCode.en, value: 'LC1D - Contactors' }] },
                    { value: 'SXWASP', label: [{ languageCode: LanguageCode.en, value: 'SXWASP - SpaceLogic Automation Server' }] }
                ],
                ui: {
                    tab: '📋 Basic Info'
                }
            },
            {
                name: 'brand',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'Brand' }],
                options: [
                    { value: 'schneider', label: [{ languageCode: LanguageCode.en, value: 'Schneider Electric' }] },
                    { value: 'siemens', label: [{ languageCode: LanguageCode.en, value: 'Siemens' }] },
                    { value: 'abb', label: [{ languageCode: LanguageCode.en, value: 'ABB' }] },
                    { value: 'legrand', label: [{ languageCode: LanguageCode.en, value: 'Legrand' }] }
                ],
                ui: {
                    displayIf: { productType: ['A9D', 'TM100', 'TM200', 'TM241', 'TM221', 'LC1D', 'SXWASP'] },
                    tab: '🏭 Universal Properties'
                }
            },
            {
                name: 'voltage',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'Operating Voltage' }],
                options: [
                    { value: '12V', label: [{ languageCode: LanguageCode.en, value: '12V DC' }] },
                    { value: '24V', label: [{ languageCode: LanguageCode.en, value: '24V DC' }] },
                    { value: '85-264V AC', label: [{ languageCode: LanguageCode.en, value: '85-264V AC (Universal)' }] },
                    { value: '100-240V AC', label: [{ languageCode: LanguageCode.en, value: '100-240V AC' }] },
                    { value: '110V', label: [{ languageCode: LanguageCode.en, value: '110V AC' }] },
                    { value: '230V', label: [{ languageCode: LanguageCode.en, value: '230V AC' }] },
                    { value: '400V', label: [{ languageCode: LanguageCode.en, value: '400V AC' }] },
                    { value: '690V', label: [{ languageCode: LanguageCode.en, value: '690V AC' }] }
                ],
                ui: {
                    displayIf: { productType: ['A9D', 'TM100', 'TM200', 'TM241', 'TM221', 'LC1D', 'SXWASP'] },
                    tab: '🏭 Universal Properties'
                }
            },
            // ===== CIRCUIT BREAKER PROPERTIES TAB =====
            {
                name: 'poles',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'Number of Poles' }],
                options: [
                    { value: '', label: [{ languageCode: LanguageCode.en, value: '' }] },
                    { value: '1P', label: [{ languageCode: LanguageCode.en, value: '1 Pole' }] },
                    { value: '2P', label: [{ languageCode: LanguageCode.en, value: '2 Poles' }] },
                    { value: '3P', label: [{ languageCode: LanguageCode.en, value: '3 Poles' }] },
                    { value: '4P', label: [{ languageCode: LanguageCode.en, value: '4 Poles' }] },
                    { value: '3P+N', label: [{ languageCode: LanguageCode.en, value: '3P + Neutral' }] }
                ],
                ui: {
                    displayIf: { productType: ['A9D'] },
                    tab: '🔌 Circuit Breaker'
                }
            },
            {
                name: 'current',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'Current Rating' }],
                options: [
                    { value: '6A', label: [{ languageCode: LanguageCode.en, value: '6A' }] },
                    { value: '10A', label: [{ languageCode: LanguageCode.en, value: '10A' }] },
                    { value: '16A', label: [{ languageCode: LanguageCode.en, value: '16A' }] },
                    { value: '20A', label: [{ languageCode: LanguageCode.en, value: '20A' }] },
                    { value: '25A', label: [{ languageCode: LanguageCode.en, value: '25A' }] },
                    { value: '32A', label: [{ languageCode: LanguageCode.en, value: '32A' }] },
                    { value: '40A', label: [{ languageCode: LanguageCode.en, value: '40A' }] },
                    { value: '50A', label: [{ languageCode: LanguageCode.en, value: '50A' }] },
                    { value: '63A', label: [{ languageCode: LanguageCode.en, value: '63A' }] }
                ],
                ui: {
                    displayIf: { productType: ['A9D'] },
                    tab: '🔌 Circuit Breaker'
                }
            },
            {
                name: 'curve',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'Trip Curve' }],
                options: [
                    { value: 'B', label: [{ languageCode: LanguageCode.en, value: 'B (3-5×In)' }] },
                    { value: 'C', label: [{ languageCode: LanguageCode.en, value: 'C (5-10×In)' }] },
                    { value: 'D', label: [{ languageCode: LanguageCode.en, value: 'D (10-20×In)' }] },
                    { value: 'K', label: [{ languageCode: LanguageCode.en, value: 'K (Motor)' }] },
                    { value: 'Z', label: [{ languageCode: LanguageCode.en, value: 'Z (Electronic)' }] }
                ],
                ui: {
                    displayIf: { productType: ['A9D'] },
                    tab: '🔌 Circuit Breaker'
                }
            },
            {
                name: 'breakingCapacity',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'Breaking Capacity' }],
                options: [
                    { value: '3kA', label: [{ languageCode: LanguageCode.en, value: '3 kA' }] },
                    { value: '4.5kA', label: [{ languageCode: LanguageCode.en, value: '4.5 kA' }] },
                    { value: '6kA', label: [{ languageCode: LanguageCode.en, value: '6 kA' }] },
                    { value: '10kA', label: [{ languageCode: LanguageCode.en, value: '10 kA' }] },
                    { value: '15kA', label: [{ languageCode: LanguageCode.en, value: '15 kA' }] },
                    { value: '25kA', label: [{ languageCode: LanguageCode.en, value: '25 kA' }] }
                ],
                ui: {
                    displayIf: { productType: ['A9D'] },
                    tab: '🔌 Circuit Breaker'
                }
            },
            // ===== PLC I/O TAB =====
            {
                name: 'digitalInputs',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'Digital Inputs' }],
                options: [
                    { value: '8', label: [{ languageCode: LanguageCode.en, value: '8 DI' }] },
                    { value: '9', label: [{ languageCode: LanguageCode.en, value: '9 DI' }] },
                    { value: '12', label: [{ languageCode: LanguageCode.en, value: '12 DI' }] },
                    { value: '14', label: [{ languageCode: LanguageCode.en, value: '14 DI' }] },
                    { value: '16', label: [{ languageCode: LanguageCode.en, value: '16 DI' }] },
                    { value: '20', label: [{ languageCode: LanguageCode.en, value: '20 DI' }] },
                    { value: '24', label: [{ languageCode: LanguageCode.en, value: '24 DI' }] }
                ],
                ui: {
                    displayIf: { productType: ['TM100', 'TM200', 'TM241', 'TM221'] },
                    tab: '🤖 PLC I/O'
                }
            },
            {
                name: 'digitalOutputs',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'Digital Outputs' }],
                options: [
                    { value: '0', label: [{ languageCode: LanguageCode.en, value: '0 DO' }] },
                    { value: '4', label: [{ languageCode: LanguageCode.en, value: '4 DO' }] },
                    { value: '6', label: [{ languageCode: LanguageCode.en, value: '6 DO' }] },
                    { value: '7', label: [{ languageCode: LanguageCode.en, value: '7 DO' }] },
                    { value: '8', label: [{ languageCode: LanguageCode.en, value: '8 DO' }] },
                    { value: '10', label: [{ languageCode: LanguageCode.en, value: '10 DO' }] },
                    { value: '12', label: [{ languageCode: LanguageCode.en, value: '12 DO' }] },
                    { value: '16', label: [{ languageCode: LanguageCode.en, value: '16 DO' }] },
                    { value: '20', label: [{ languageCode: LanguageCode.en, value: '20 DO' }] }
                ],
                ui: {
                    displayIf: { productType: ['TM100', 'TM200', 'TM241', 'TM221'] },
                    tab: '🤖 PLC I/O'
                }
            },
            {
                name: 'analogInputs',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'Analog Inputs' }],
                options: [
                    { value: '0', label: [{ languageCode: LanguageCode.en, value: '0 AI' }] },
                    { value: '2', label: [{ languageCode: LanguageCode.en, value: '2 AI' }] },
                    { value: '4', label: [{ languageCode: LanguageCode.en, value: '4 AI' }] },
                    { value: '8', label: [{ languageCode: LanguageCode.en, value: '8 AI' }] }
                ],
                ui: {
                    displayIf: { productType: ['TM100', 'TM200', 'TM241', 'TM221'] },
                    tab: '🤖 PLC I/O'
                }
            },
            {
                name: 'analogOutputs',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'Analog Outputs' }],
                options: [
                    { value: '0', label: [{ languageCode: LanguageCode.en, value: '0 AO' }] },
                    { value: '2', label: [{ languageCode: LanguageCode.en, value: '2 AO' }] },
                    { value: '4', label: [{ languageCode: LanguageCode.en, value: '4 AO' }] }
                ],
                ui: {
                    displayIf: { productType: ['TM241', 'TM221'] },
                    tab: '🤖 PLC I/O'
                }
            },
            {
                name: 'relayOutputs',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'Relay Outputs' }],
                options: [
                    { value: '0', label: [{ languageCode: LanguageCode.en, value: '0 Relay' }] },
                    { value: '4', label: [{ languageCode: LanguageCode.en, value: '4 Relay' }] },
                    { value: '6', label: [{ languageCode: LanguageCode.en, value: '6 Relay' }] },
                    { value: '8', label: [{ languageCode: LanguageCode.en, value: '8 Relay' }] },
                    { value: '12', label: [{ languageCode: LanguageCode.en, value: '12 Relay' }] }
                ],
                ui: {
                    displayIf: { productType: ['TM241', 'TM221'] },
                    tab: '🤖 PLC I/O'
                }
            },
            // ===== PLC COMMUNICATION TAB =====
            {
                name: 'communication',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'Communication Protocols' }],
                options: [
                    { value: 'RS485', label: [{ languageCode: LanguageCode.en, value: 'RS485 Serial' }] },
                    { value: 'Modbus', label: [{ languageCode: LanguageCode.en, value: 'Modbus' }] },
                    { value: 'Ethernet', label: [{ languageCode: LanguageCode.en, value: 'Ethernet TCP/IP' }] },
                    { value: 'CAN', label: [{ languageCode: LanguageCode.en, value: 'CAN Bus' }] },
                    { value: 'USB', label: [{ languageCode: LanguageCode.en, value: 'USB' }] },
                    { value: 'RS232', label: [{ languageCode: LanguageCode.en, value: 'RS232' }] },
                    { value: 'TCP/IP', label: [{ languageCode: LanguageCode.en, value: 'TCP/IP' }] },
                    { value: 'BACnet', label: [{ languageCode: LanguageCode.en, value: 'BACnet' }] },
                    { value: 'LON Works', label: [{ languageCode: LanguageCode.en, value: 'LON Works' }] },
                    { value: 'Modbus+RS485+RS232+USB', label: [{ languageCode: LanguageCode.en, value: 'Modbus+RS485+RS232+USB' }] },
                    { value: 'Modbus+TCP/IP+RS485+RS232+USB+Ethernet', label: [{ languageCode: LanguageCode.en, value: 'Modbus+TCP/IP+RS485+RS232+USB+Ethernet' }] },
                    { value: 'Modbus+Ethernet+Ethernet+RS485+RS232+USB', label: [{ languageCode: LanguageCode.en, value: 'Modbus+Ethernet+RS485+RS232+USB' }] },
                    { value: 'Modbus+USB', label: [{ languageCode: LanguageCode.en, value: 'Modbus+USB' }] },
                    { value: 'Modbus+Ethernet+USB', label: [{ languageCode: LanguageCode.en, value: 'Modbus+Ethernet+USB' }] },
                    { value: 'BACnet IP+Ethernet+RS-485+LON Works', label: [{ languageCode: LanguageCode.en, value: 'BACnet IP+Ethernet+RS-485+LON Works' }] }
                ],
                ui: {
                    displayIf: { productType: ['TM100', 'TM200', 'TM241', 'TM221', 'SXWASP'] },
                    tab: '💻 PLC Communication'
                }
            },
            {
                name: 'programmingLanguage',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'Programming Language' }],
                options: [
                    { value: 'Ladder', label: [{ languageCode: LanguageCode.en, value: 'Ladder Logic' }] },
                    { value: 'FBD', label: [{ languageCode: LanguageCode.en, value: 'Function Block' }] },
                    { value: 'ST', label: [{ languageCode: LanguageCode.en, value: 'Structured Text' }] },
                    { value: 'IL', label: [{ languageCode: LanguageCode.en, value: 'Instruction List' }] },
                    { value: 'SFC', label: [{ languageCode: LanguageCode.en, value: 'Sequential Chart' }] },
                    { value: 'Ladder+FBD+ST', label: [{ languageCode: LanguageCode.en, value: 'Ladder+FBD+ST' }] }
                ],
                ui: {
                    displayIf: { productType: ['TM100', 'TM200', 'TM241', 'TM221'] },
                    tab: '💻 PLC Communication'
                }
            },
            {
                name: 'usbPorts',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'USB Ports' }],
                options: [
                    { value: '0', label: [{ languageCode: LanguageCode.en, value: '0 USB' }] },
                    { value: '1', label: [{ languageCode: LanguageCode.en, value: '1 USB' }] },
                    { value: '2', label: [{ languageCode: LanguageCode.en, value: '2 USB' }] }
                ],
                ui: {
                    displayIf: { productType: ['TM241', 'TM221'] },
                    tab: '💻 PLC Communication'
                }
            },
            {
                name: 'rs485Ports',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'RS485 Ports' }],
                options: [
                    { value: '0', label: [{ languageCode: LanguageCode.en, value: '0 RS485' }] },
                    { value: '1', label: [{ languageCode: LanguageCode.en, value: '1 RS485' }] },
                    { value: '2', label: [{ languageCode: LanguageCode.en, value: '2 RS485' }] }
                ],
                ui: {
                    displayIf: { productType: ['TM241', 'TM221'] },
                    tab: '💻 PLC Communication'
                }
            },
            {
                name: 'rs232Ports',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'RS232 Ports' }],
                options: [
                    { value: '0', label: [{ languageCode: LanguageCode.en, value: '0 RS232' }] },
                    { value: '1', label: [{ languageCode: LanguageCode.en, value: '1 RS232' }] },
                    { value: '2', label: [{ languageCode: LanguageCode.en, value: '2 RS232' }] }
                ],
                ui: {
                    displayIf: { productType: ['TM241', 'TM221'] },
                    tab: '💻 PLC Communication'
                }
            },
            {
                name: 'ethernetPorts',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'Ethernet Ports' }],
                options: [
                    { value: '0', label: [{ languageCode: LanguageCode.en, value: '0 Ethernet' }] },
                    { value: '1', label: [{ languageCode: LanguageCode.en, value: '1 Ethernet' }] },
                    { value: '2', label: [{ languageCode: LanguageCode.en, value: '2 Ethernet' }] }
                ],
                ui: {
                    displayIf: { productType: ['TM241', 'TM221', 'SXWASP'] },
                    tab: '💻 PLC Communication'
                }
            },
            {
                name: 'serialPorts',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'Serial Ports (RS-485/RS-232)' }],
                options: [
                    { value: '0', label: [{ languageCode: LanguageCode.en, value: '0 Serial' }] },
                    { value: '1', label: [{ languageCode: LanguageCode.en, value: '1 Serial' }] },
                    { value: '2', label: [{ languageCode: LanguageCode.en, value: '2 Serial' }] },
                    { value: '4', label: [{ languageCode: LanguageCode.en, value: '4 Serial' }] }
                ],
                ui: {
                    displayIf: { productType: ['SXWASP'] },
                    tab: '🏢 Automation Server'
                }
            },
            // ===== DIMENSIONS TAB =====
            {
                name: 'height',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'Height' }],
                description: [{ languageCode: LanguageCode.en, value: 'Product height with unit (e.g. 90mm or 12.8cm)' }],
                ui: {
                    tab: '📏 Dimensions'
                }
            },
            {
                name: 'width',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'Width' }],
                description: [{ languageCode: LanguageCode.en, value: 'Product width with unit (e.g. 130mm or 11.46cm)' }],
                ui: {
                    tab: '📏 Dimensions'
                }
            },
            {
                name: 'depth',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'Depth' }],
                description: [{ languageCode: LanguageCode.en, value: 'Product depth with unit (e.g. 70mm or 22.61cm)' }],
                ui: {
                    tab: '📏 Dimensions'
                }
            },
            {
                name: 'weight',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'Weight' }],
                description: [{ languageCode: LanguageCode.en, value: 'Product weight with unit (e.g. 545g or 930g)' }],
                ui: {
                    tab: '📏 Dimensions'
                }
            },
            // ===== CONTACTOR PROPERTIES TAB =====
            {
                name: 'coilVoltage',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'Coil Voltage' }],
                options: [
                    { value: '24VAC', label: [{ languageCode: LanguageCode.en, value: '24V AC' }] },
                    { value: '230VAC', label: [{ languageCode: LanguageCode.en, value: '230V AC' }] },
                    { value: '400VAC', label: [{ languageCode: LanguageCode.en, value: '400V AC' }] },
                    { value: '24VDC', label: [{ languageCode: LanguageCode.en, value: '24V DC' }] },
                    { value: '48VDC', label: [{ languageCode: LanguageCode.en, value: '48V DC' }] },
                    { value: '110VDC', label: [{ languageCode: LanguageCode.en, value: '110V DC' }] }
                ],
                ui: {
                    displayIf: { productType: ['LC1D'] },
                    tab: '⚡ Contactor Properties'
                }
            },
            {
                name: 'contactConfiguration',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'Contact Configuration' }],
                options: [
                    { value: '3P', label: [{ languageCode: LanguageCode.en, value: '3 Pole' }] },
                    { value: '4P', label: [{ languageCode: LanguageCode.en, value: '4 Pole' }] },
                    { value: '3P+1NO', label: [{ languageCode: LanguageCode.en, value: '3P + 1 NO' }] },
                    { value: '3P+1NC', label: [{ languageCode: LanguageCode.en, value: '3P + 1 NC' }] },
                    { value: '3P+1NO+1NC', label: [{ languageCode: LanguageCode.en, value: '3P + 1 NO + 1 NC' }] }
                ],
                ui: {
                    displayIf: { productType: ['LC1D'] },
                    tab: '⚡ Contactor Properties'
                }
            },
            {
                name: 'ratedCurrent',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'Rated Current' }],
                options: [
                    { value: '9A', label: [{ languageCode: LanguageCode.en, value: '9A' }] },
                    { value: '12A', label: [{ languageCode: LanguageCode.en, value: '12A' }] },
                    { value: '18A', label: [{ languageCode: LanguageCode.en, value: '18A' }] },
                    { value: '25A', label: [{ languageCode: LanguageCode.en, value: '25A' }] },
                    { value: '32A', label: [{ languageCode: LanguageCode.en, value: '32A' }] },
                    { value: '40A', label: [{ languageCode: LanguageCode.en, value: '40A' }] },
                    { value: '50A', label: [{ languageCode: LanguageCode.en, value: '50A' }] },
                    { value: '65A', label: [{ languageCode: LanguageCode.en, value: '65A' }] },
                    { value: '80A', label: [{ languageCode: LanguageCode.en, value: '80A' }] },
                    { value: '95A', label: [{ languageCode: LanguageCode.en, value: '95A' }] }
                ],
                ui: {
                    displayIf: { productType: ['LC1D'] },
                    tab: '⚡ Contactor Properties'
                }
            },
            // ===== STATUS INFO TAB =====
            {
                name: 'commercialStatus',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'Commercial Status' }],
                description: [{ languageCode: LanguageCode.en, value: 'Product availability status from supplier' }],
                readonly: true,
                ui: {
                    tab: '📊 Status Info'
                }
            },
            {
                name: 'statusCode',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'Status Code' }],
                description: [{ languageCode: LanguageCode.en, value: 'Internal status code from supplier API' }],
                readonly: true,
                ui: {
                    tab: '📊 Status Info'
                }
            },
            {
                name: 'stockStatus',
                type: 'string',
                label: [{ languageCode: LanguageCode.en, value: 'Stock Status' }],
                description: [{ languageCode: LanguageCode.en, value: 'Current inventory status - manually editable' }],
                options: [
                    { value: 'inStock', label: [{ languageCode: LanguageCode.en, value: '✅ In Stock' }] },
                    { value: 'outOfStock', label: [{ languageCode: LanguageCode.en, value: '❌ Out of Stock' }] },
                    { value: 'lowStock', label: [{ languageCode: LanguageCode.en, value: '⚠️ Low Stock' }] },
                    { value: 'preOrder', label: [{ languageCode: LanguageCode.en, value: '📅 Pre-Order' }] },
                    { value: 'discontinued', label: [{ languageCode: LanguageCode.en, value: '🚫 Discontinued' }] }
                ],
                ui: {
                    tab: '📊 Status Info'
                }
            }
        ],
        ProductVariant: []
    },
    plugins: [
        GraphiqlPlugin.init(),
        AssetServerPlugin.init({
            route: 'assets',
            assetUploadDir: path.join(__dirname, '../static/assets'),
            // For local dev, the correct value for assetUrlPrefix should
            // be guessed correctly, but for production it will usually need
            // to be set manually to match your production url.
            assetUrlPrefix: IS_DEV ? undefined : 'https://www.my-shop.com/assets/',
        }),
        AutoFacetsPlugin.init(),
        DefaultSchedulerPlugin.init(),
        DefaultJobQueuePlugin.init({ useDatabaseForBuffer: true }),
        DefaultSearchPlugin.init({ bufferUpdates: false, indexStockStatus: true }),
        EmailPlugin.init({
            devMode: true,
            outputPath: path.join(__dirname, '../static/email/test-emails'),
            route: 'mailbox',
            handlers: defaultEmailHandlers,
            templateLoader: new FileBasedTemplateLoader(path.join(__dirname, '../static/email/templates')),
            globalTemplateVars: {
                // The following variables will change depending on your storefront implementation.
                // Here we are assuming a storefront running at http://localhost:8080.
                fromAddress: '"example" <noreply@example.com>',
                verifyEmailAddressUrl: 'http://localhost:8080/verify',
                passwordResetUrl: 'http://localhost:8080/password-reset',
                changeEmailAddressUrl: 'http://localhost:8080/verify-email-address-change'
            },
        }),
        AdminUiPlugin.init({
            route: 'admin',
            port: serverPort + 2,
            adminUiConfig: {
                apiPort: serverPort,
            },
        }),
    ],
};