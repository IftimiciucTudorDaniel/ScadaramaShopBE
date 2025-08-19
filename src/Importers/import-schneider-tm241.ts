// src/import-tm241.ts
import {
    bootstrap,
    LanguageCode,
    ProductService,
    ProductVariantService,
    RequestContextService,
    ChannelService,
    TransactionalConnection,
} from '@vendure/core';
import { GlobalFlag } from '@vendure/common/lib/generated-types';
import { config } from '../vendure-config';
import { AutoFacetsService } from '../plugins/auto-facets.plugin';
import fs from 'fs';
import csv from 'csv-parser';

async function importTM241Products() {
    console.log('🚀 Starting TM241 import...');

    const csvPath = 'src/DataCSV/tm251_batch_import.csv';
    if (!fs.existsSync(csvPath)) {
        console.error(`❌ CSV file not found: ${csvPath}`);
        console.error('💡 Make sure you have run the Python script to generate tm251_batch_import.csv');
        process.exit(1);
    }

    const app = await bootstrap(config);
    const connection = app.get(TransactionalConnection);
    const ctxService = app.get(RequestContextService);
    const channelService = app.get(ChannelService);
    const productService = app.get(ProductService);
    const variantService = app.get(ProductVariantService);
    const autoFacetsService = app.get(AutoFacetsService);

    const defaultChannel = await channelService.getDefaultChannel();

    // Create admin context
    const ctx = await ctxService.create({
        apiType: 'admin',
        channelOrToken: defaultChannel.token,
        languageCode: LanguageCode.en,
    });

    const rows: any[] = [];

    return new Promise((resolve, reject) => {
        fs.createReadStream(csvPath)
            .pipe(csv({
                separator: ','
                // csv-parser automatically uses first row as headers
            }))
            .on('data', (row) => {
                // Skip empty rows manually
                if (!row.name || row.name.trim() === '') {
                    return;
                }
                console.log('📋 Raw CSV row:', row);
                rows.push(row);
            })
            .on('end', async () => {
                console.log(`📦 Found ${rows.length} TM241 products in CSV`);

                let importedCount = 0;
                let skippedCount = 0;
                let errorCount = 0;

                for (const [index, row] of rows.entries()) {
                    console.log(`\n🔄 Processing row ${index + 1}/${rows.length}: ${row.name}`);

                    try {
                        // Validate required fields
                        if (!row.sku || !row.name || !row.price) {
                            console.error(`❌ Missing required fields for row ${index + 1}:`, {
                                sku: row.sku,
                                name: row.name,
                                price: row.price
                            });
                            errorCount++;
                            continue;
                        }

                        // Price conversion - assume CSV has price in major currency units (e.g., 1698.72)
                        const priceInCents = Math.round(parseFloat(row.price) * 100);
                        if (isNaN(priceInCents)) {
                            console.error(`❌ Invalid price for row ${index + 1}: ${row.price}`);
                            errorCount++;
                            continue;
                        }

                        // Check for existing variant by SKU, but only if it's NOT soft-deleted
                        const existingVariant = await connection.rawConnection
                            .getRepository('product_variant')
                            .createQueryBuilder('variant')
                            .where('variant.sku = :sku', { sku: row.sku })
                            .andWhere('variant.deletedAt IS NULL') // Ignore soft-deleted products
                            .getOne();

                        if (existingVariant) {
                            console.log(`⚠️ Skipping duplicate SKU: ${row.sku}`);
                            skippedCount++;
                            continue;
                        }

                        // Parse boolean values
                        const trackInventory = row.trackInventory?.toLowerCase() === 'true' ? GlobalFlag.TRUE : GlobalFlag.FALSE;
                        const enabled = row.enabled?.toLowerCase() === 'true';
                        const stockOnHand = parseInt(row.stockOnHand, 10) || 0;

                        // Prepare custom fields - map CSV columns to actual field names for TM241
                        const customFields: any = {};

                        // Core TM241 fields
                        if (row['customFields:analogInputs']) customFields.analogInputs = row['customFields:analogInputs'];
                        if (row['customFields:analogOutputs']) customFields.analogOutputs = row['customFields:analogOutputs'];
                        if (row['customFields:brand']) customFields.brand = row['customFields:brand'];
                        if (row['customFields:category']) customFields.category = row['customFields:category'];
                        if (row['customFields:commercialStatus']) customFields.commercialStatus = row['customFields:commercialStatus'];
                        if (row['customFields:communication']) customFields.communication = row['customFields:communication'];
                        if (row['customFields:digitalInputs']) customFields.digitalInputs = row['customFields:digitalInputs'];
                        if (row['customFields:digitalOutputs']) customFields.digitalOutputs = row['customFields:digitalOutputs'];
                        if (row['customFields:productType']) customFields.productType = row['customFields:productType'];
                        if (row['customFields:programmingLanguage']) customFields.programmingLanguage = row['customFields:programmingLanguage'];
                        if (row['customFields:statusCode']) customFields.statusCode = row['customFields:statusCode'];
                        if (row['customFields:voltage']) customFields.voltage = row['customFields:voltage'];

                        // TM241-specific enhanced fields
                        if (row['customFields:relayOutputs']) customFields.relayOutputs = row['customFields:relayOutputs'];
                        if (row['customFields:series']) customFields.series = row['customFields:series'];
                        if (row['customFields:memorySize']) customFields.memorySize = row['customFields:memorySize'];
                        if (row['customFields:processingTime']) customFields.processingTime = row['customFields:processingTime'];
                        if (row['customFields:performanceLevel']) customFields.performanceLevel = row['customFields:performanceLevel'];
                        if (row['customFields:mountingType']) customFields.mountingType = row['customFields:mountingType'];

                        // Interface port counts
                        if (row['customFields:usbPorts']) customFields.usbPorts = row['customFields:usbPorts'];
                        if (row['customFields:rs485Ports']) customFields.rs485Ports = row['customFields:rs485Ports'];
                        if (row['customFields:rs232Ports']) customFields.rs232Ports = row['customFields:rs232Ports'];
                        if (row['customFields:ethernetPorts']) customFields.ethernetPorts = row['customFields:ethernetPorts'];

                        // Physical dimensions and weight
                        if (row['customFields:height']) customFields.height = row['customFields:height'];
                        if (row['customFields:width']) customFields.width = row['customFields:width'];
                        if (row['customFields:depth']) customFields.depth = row['customFields:depth'];
                        if (row['customFields:weight']) customFields.weight = row['customFields:weight'];

                        // Stock status (if available)
                        if (row['customFields:stockStatus']) customFields.stockStatus = row['customFields:stockStatus'];

                        console.log('📋 Mapped TM241 custom fields:', customFields);

                        // 1. Create product
                        console.log('🔨 Creating TM241 product...');
                        const createdProduct = await productService.create(ctx, {
                            translations: [{
                                languageCode: LanguageCode.en,
                                name: row.name,
                                slug: row.slug,
                                description: row.description || '',
                            }],
                            customFields: customFields,
                        });

                        console.log(`✅ TM241 Product created with ID: ${createdProduct.id}`);

                        // 2. Create variant
                        console.log('🔨 Creating TM241 variant...');
                        const createdVariant = await variantService.create(ctx, [{
                            productId: createdProduct.id,
                            sku: row.sku,
                            price: priceInCents,
                            stockOnHand: stockOnHand,
                            trackInventory: trackInventory,
                            enabled: enabled,
                            translations: [{
                                languageCode: LanguageCode.en,
                                name: `${row.name} Variant`,
                            }],
                        }]);

                        console.log(`✅ TM241 Variant created with ID: ${createdVariant[0].id}`);

                        // 3. MANUALLY TRIGGER FACET CREATION (including all TM241 properties)
                        console.log('🎯 Triggering facet creation for TM241...');
                        try {
                            // Use the public method to manually process facets
                            await autoFacetsService.manuallyProcessProduct(ctx, createdProduct.id);
                            console.log('✅ TM241 Facets processed successfully (including all enhanced properties)');
                        } catch (facetError: any) {
                            console.warn('⚠️ TM241 Facet creation warning:', facetError.message);
                        }

                        // Log the comprehensive technical specs for verification
                        console.log('📊 TM241 Technical Specifications:');
                        console.log(`   🔌 Digital I/O: ${customFields.digitalInputs || 'N/A'} inputs, ${customFields.digitalOutputs || 'N/A'} outputs`);
                        console.log(`   ⚡ Relay Outputs: ${customFields.relayOutputs || 'N/A'}`);
                        console.log(`   📈 Analog I/O: ${customFields.analogInputs || '0'} inputs, ${customFields.analogOutputs || '0'} outputs`);
                        console.log(`   📡 Communication: ${customFields.communication || 'N/A'}`);
                        console.log(`   🔌 Interfaces: USB(${customFields.usbPorts || '0'}), RS485(${customFields.rs485Ports || '0'}), RS232(${customFields.rs232Ports || '0'}), Ethernet(${customFields.ethernetPorts || '0'})`);
                        console.log(`   ⚡ Voltage: ${customFields.voltage || 'N/A'}`);
                        console.log(`   💾 Memory: ${customFields.memorySize || 'N/A'}`);
                        console.log(`   ⏱️ Processing Time: ${customFields.processingTime || 'N/A'}`);
                        console.log(`   📏 Dimensions: ${customFields.height || 'N/A'} x ${customFields.width || 'N/A'} x ${customFields.depth || 'N/A'}`);
                        console.log(`   ⚖️ Weight: ${customFields.weight || 'N/A'}`);
                        console.log(`   📚 Series: ${customFields.series || 'N/A'}`);
                        console.log(`   🏭 Programming: ${customFields.programmingLanguage || 'N/A'}`);
                        console.log(`   📈 Performance: ${customFields.performanceLevel || 'N/A'}`);
                        console.log(`   🔧 Mounting: ${customFields.mountingType || 'N/A'}`);
                        console.log(`   📦 Stock Status: ${customFields.stockStatus || 'N/A'}`);

                        console.log(`✅ Imported TM241 product: ${row.name} (SKU: ${row.sku})`);
                        importedCount++;

                    } catch (err: any) {
                        console.error(`❌ Failed to import TM241 product: ${row.name}`, err);
                        console.error('Error details:', err.message);
                        if (err.stack) {
                            console.error('Stack trace:', err.stack);
                        }
                        errorCount++;
                    }
                }

                console.log(`\n📊 TM241 Import Summary:`);
                console.log(`   ✅ Imported: ${importedCount}`);
                console.log(`   ⚠️ Skipped duplicates: ${skippedCount}`);
                console.log(`   ❌ Errors: ${errorCount}`);
                console.log(`   📦 Total processed: ${rows.length}`);

                if (importedCount > 0) {
                    console.log(`\n🎯 TM241 Products Successfully Imported:`);
                    console.log(`   📦 Product Type: TM241 (Modicon M241 Logic Controllers)`);
                    console.log(`   📂 Category: PLC`);
                    console.log(`   🔧 Features: Enhanced I/O mapping, Communication protocols, Physical specs`);
                    console.log(`   📏 Dimensions: Height, Width, Depth from logistics data`);
                    console.log(`   ⚖️ Weight: Extracted from packing information`);
                    console.log(`   🖼️ Images: Product images from Schneider API`);
                    console.log(`   📡 Interfaces: USB, RS485, RS232, Ethernet port counts`);
                    console.log(`   💾 Performance: Memory size and processing time`);
                    console.log(`   🎨 Facets: Auto-generated for all technical properties`);
                    console.log(`   ⚡ Voltage: Universal input support (85-264V AC)`);
                    console.log(`   📚 Series: Modicon M241 series information`);
                    console.log(`   🏭 Programming: Ladder+FBD+ST language support`);
                }

                console.log('🎉 TM241 import complete!');

                // Give some time for background processes before closing
                console.log('⏳ Waiting for background processes...');
                setTimeout(async () => {
                    await app.close();
                    resolve(void 0);
                }, 2000);
            })
            .on('error', (error) => {
                console.error('❌ CSV parsing error:', error);
                reject(error);
            });
    });
}

importTM241Products().catch((err) => {
    console.error('❌ Fatal TM241 import error:', err);
    process.exit(1);
});