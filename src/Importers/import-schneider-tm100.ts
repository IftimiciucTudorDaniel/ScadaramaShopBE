// src/import-tm100.ts
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

async function importTM100Products() {
    console.log('🚀 Starting TM100 import...');

    const csvPath = 'src/DataCSV/tm100_batch_import.csv';
    if (!fs.existsSync(csvPath)) {
        console.error(`❌ CSV file not found: ${csvPath}`);
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
                console.log(`📦 Found ${rows.length} TM100 products in CSV`);

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

                        // Price is already in cents format in your CSV, don't multiply by 100
                        const priceInCents = Math.round(parseFloat(row.price));
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
                            .andWhere('variant.deletedAt IS NULL') // <-- Aici s-a adăugat verificarea pentru a ignora produsele șterse
                            .getOne();

                        if (existingVariant) {
                            console.log(`⚠️ Skipping duplicate SKU: ${row.sku}`);
                            skippedCount++;
                            continue;
                        }

                        // Parse boolean values - use correct GlobalFlag enum values
                        const trackInventory = row.trackInventory?.toLowerCase() === 'true' ? GlobalFlag.TRUE : GlobalFlag.FALSE;
                        const enabled = row.enabled?.toLowerCase() === 'true';
                        const stockOnHand = parseInt(row.stockOnHand, 10) || 0;

                        // Prepare custom fields - map CSV columns to actual field names
                        const customFields: any = {};

                        // Map the CSV custom field columns to the actual custom field names
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
                        if (row['customFields:height']) customFields.height = row['customFields:height'];
                        if (row['customFields:width']) customFields.width = row['customFields:width'];
                        if (row['customFields:depth']) customFields.depth = row['customFields:depth'];
                        if (row['customFields:weight']) customFields.weight = row['customFields:weight'];

                        console.log('📋 Mapped custom fields:', customFields);

                        // 1. Create product
                        console.log('🔨 Creating product...');
                        const createdProduct = await productService.create(ctx, {
                            translations: [{
                                languageCode: LanguageCode.en,
                                name: row.name,
                                slug: row.slug,
                                description: row.description || '',
                            }],
                            customFields: customFields,
                        });

                        console.log(`✅ Product created with ID: ${createdProduct.id}`);

                        // 2. Create variant
                        console.log('🔨 Creating variant...');
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

                        console.log(`✅ Variant created with ID: ${createdVariant[0].id}`);

                        // 3. MANUALLY TRIGGER FACET CREATION
                        console.log('🎯 Triggering facet creation...');
                        try {
                            // Use the public method to manually process facets
                            await autoFacetsService.manuallyProcessProduct(ctx, createdProduct.id);
                            console.log('✅ Facets processed successfully');
                        } catch (facetError: any) {
                            console.warn('⚠️ Facet creation warning:', facetError.message);
                        }

                        console.log(`✅ Imported product: ${row.name} (SKU: ${row.sku})`);
                        importedCount++;

                    } catch (err: any) {
                        console.error(`❌ Failed to import product: ${row.name}`, err);
                        console.error('Error details:', err.message);
                        if (err.stack) {
                            console.error('Stack trace:', err.stack);
                        }
                        errorCount++;
                    }
                }

                console.log(`\n📊 Import Summary:`);
                console.log(`   ✅ Imported: ${importedCount}`);
                console.log(`   ⚠️ Skipped duplicates: ${skippedCount}`);
                console.log(`   ❌ Errors: ${errorCount}`);
                console.log(`   📦 Total processed: ${rows.length}`);

                console.log('🎉 TM100 import complete!');

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

importTM100Products().catch((err) => {
    console.error('❌ Fatal import error:', err);
    process.exit(1);
});
