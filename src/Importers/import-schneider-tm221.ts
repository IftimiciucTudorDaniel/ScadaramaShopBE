// src/import-tm221.ts
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

async function importTM221Products() {
    console.log('🚀 Starting TM221 import...');

    const csvPath = 'src/DataCSV/tm221_batch_import.csv';
    if (!fs.existsSync(csvPath)) {
        console.error(`❌ CSV file not found: ${csvPath}`);
        console.error('💡 Make sure you have run the Python script to generate tm221_batch_import.csv');
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
                console.log('📋 Raw TM221 CSV row:', row);
                rows.push(row);
            })
            .on('end', async () => {
                console.log(`📦 Found ${rows.length} TM221 products in CSV`);

                let importedCount = 0;
                let skippedCount = 0;
                let errorCount = 0;

                for (const [index, row] of rows.entries()) {
                    console.log(`\n🔄 Processing TM221 row ${index + 1}/${rows.length}: ${row.name}`);

                    try {
                        // Validate required fields
                        if (!row.sku || !row.name || !row.price) {
                            console.error(`❌ Missing required fields for TM221 row ${index + 1}:`, {
                                sku: row.sku,
                                name: row.name,
                                price: row.price
                            });
                            errorCount++;
                            continue;
                        }

                        // Price conversion - TM221 CSV has price in major currency units (e.g., 1272.42)
                        const priceInCents = Math.round(parseFloat(row.price) * 100);
                        if (isNaN(priceInCents)) {
                            console.error(`❌ Invalid price for TM221 row ${index + 1}: ${row.price}`);
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
                            console.log(`⚠️ Skipping duplicate TM221 SKU: ${row.sku}`);
                            skippedCount++;
                            continue;
                        }

                        // Parse boolean values - use correct GlobalFlag enum values
                        const trackInventory = row.trackInventory?.toLowerCase() === 'true' ? GlobalFlag.TRUE : GlobalFlag.FALSE;
                        const enabled = row.enabled?.toLowerCase() === 'true';
                        const stockOnHand = parseInt(row.stockOnHand, 10) || 0;

                        // Prepare custom fields - map CSV columns to actual field names
                        const customFields: any = {};

                        // Map TM221-specific CSV custom field columns
                        if (row['customFields:analogInputs']) customFields.analogInputs = row['customFields:analogInputs'];
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

                        // TM221 Dimensions and Weight
                        if (row['customFields:height']) customFields.height = row['customFields:height'];
                        if (row['customFields:width']) customFields.width = row['customFields:width'];
                        if (row['customFields:depth']) customFields.depth = row['customFields:depth'];
                        if (row['customFields:weight']) customFields.weight = row['customFields:weight'];

                        // TM221 Stock Status (NEW FIELD)
                        if (row['customFields:stockStatus']) customFields.stockStatus = row['customFields:stockStatus'];

                        console.log('📋 Mapped TM221 custom fields:', customFields);

                        // 1. Create TM221 product
                        console.log('🔨 Creating TM221 product...');
                        const createdProduct = await productService.create(ctx, {
                            translations: [{
                                languageCode: LanguageCode.en,
                                name: row.name,
                                slug: row.slug,
                                description: row.description || '',
                            }],
                            customFields: customFields,
                        });

                        console.log(`✅ TM221 Product created with ID: ${createdProduct.id}`);

                        // 2. Create TM221 variant
                        console.log('🔨 Creating TM221 variant...');
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

                        console.log(`✅ TM221 Variant created with ID: ${createdVariant[0].id}`);

                        // 3. MANUALLY TRIGGER FACET CREATION (including dimensions, weight, and stock status)
                        console.log('🎯 Triggering facet creation for TM221...');
                        try {
                            // Use the public method to manually process facets
                            await autoFacetsService.manuallyProcessProduct(ctx, createdProduct.id);
                            console.log('✅ TM221 Facets processed successfully (including dimensions, weight & stock status)');
                        } catch (facetError: any) {
                            console.warn('⚠️ TM221 Facet creation warning:', facetError.message);
                        }

                        // Log the TM221 technical specs for verification
                        console.log('📊 TM221 Technical Specs:');
                        console.log(`   🔌 I/O: ${customFields.digitalInputs || 'N/A'} inputs, ${customFields.digitalOutputs || 'N/A'} outputs, ${customFields.analogInputs || '0'} analog`);
                        console.log(`   📡 Communication: ${customFields.communication || 'N/A'}`);
                        console.log(`   ⚡ Voltage: ${customFields.voltage || 'N/A'}`);
                        console.log(`   📏 Dimensions: ${customFields.height || 'N/A'} x ${customFields.width || 'N/A'} x ${customFields.depth || 'N/A'}`);
                        console.log(`   ⚖️ Weight: ${customFields.weight || 'N/A'}`);
                        console.log(`   📦 Stock Status: ${customFields.stockStatus || 'N/A'}`);

                        console.log(`✅ Imported TM221 product: ${row.name} (SKU: ${row.sku})`);
                        importedCount++;

                    } catch (err: any) {
                        console.error(`❌ Failed to import TM221 product: ${row.name}`, err);
                        console.error('Error details:', err.message);
                        if (err.stack) {
                            console.error('Stack trace:', err.stack);
                        }
                        errorCount++;
                    }
                }

                console.log(`\n📊 TM221 Import Summary:`);
                console.log(`   ✅ Imported: ${importedCount}`);
                console.log(`   ⚠️ Skipped duplicates: ${skippedCount}`);
                console.log(`   ❌ Errors: ${errorCount}`);
                console.log(`   📦 Total processed: ${rows.length}`);

                if (importedCount > 0) {
                    console.log(`\n🎯 TM221 Products Successfully Imported:`);
                    console.log(`   📦 Product Type: TM221 (Modicon M221 PLCs)`);
                    console.log(`   📂 Category: PLC`);
                    console.log(`   🔧 Features: Enhanced I/O, Advanced Communication, Dimensions, Weight, Stock Status`);
                    console.log(`   🎨 Facets: Auto-generated for all technical properties`);
                    console.log(`   📊 I/O Range: 8-24 inputs, 0-16 outputs, 2 analog inputs`);
                    console.log(`   📡 Communication: Modbus+Ethernet+RS485+RS232+USB combinations`);
                    console.log(`   ⚡ Voltage: 24V DC (19.2-28.8V range)`);
                    console.log(`   📏 Compact Dimensions: Various form factors`);
                    console.log(`   📦 Stock Management: In Stock tracking enabled`);
                }

                console.log('🎉 TM221 import complete!');

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

importTM221Products().catch((err) => {
    console.error('❌ Fatal TM221 import error:', err);
    process.exit(1);
});