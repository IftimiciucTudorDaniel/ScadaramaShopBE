// src/update-tm251-assets.ts
import {
    bootstrap,
    LanguageCode,
    ProductService,
    RequestContextService,
    ChannelService,
    TransactionalConnection,
    AssetService,
    ID,
} from '@vendure/core';
import { CreateAssetResult } from '@vendure/common/lib/generated-types';
import { config } from '../vendure-config';
import fs from 'fs';
import csv from 'csv-parser';
import fetch from 'node-fetch';
import path from 'path';
import { Readable } from 'stream';

// Temporar director pentru imagini
const TEMP_DIR = path.join(__dirname, '../temp-assets-tm251');

// Creează un stream compatibil cu multer pentru Vendure
function createCompatibleStream(filePath: string): any {
    const fileBuffer = fs.readFileSync(filePath);
    const stream = Readable.from(fileBuffer);
    const stats = fs.statSync(filePath);

    // Simulează obiectul File din multer care Vendure se așteaptă
    const mockFile = {
        fieldname: 'file',
        originalname: path.basename(filePath),
        encoding: '7bit',
        mimetype: filePath.endsWith('.png') ? 'image/png' : 'image/jpeg',
        buffer: fileBuffer,
        size: stats.size,
        stream: stream,
        destination: '',
        filename: path.basename(filePath),
        path: filePath,
        // Adaugă metoda createReadStream care lipsește
        createReadStream: () => fs.createReadStream(filePath)
    };

    return mockFile;
}

async function downloadImage(url: string, filename: string): Promise<string | null> {
    try {
        console.log(`📥 Downloading: ${url}`);
        const response = await fetch(url, { timeout: 30000 });

        if (!response.ok) {
            console.warn(`⚠️ Failed to download ${url}: ${response.status}`);
            return null;
        }

        const buffer = await response.buffer();

        if (!fs.existsSync(TEMP_DIR)) {
            fs.mkdirSync(TEMP_DIR, { recursive: true });
        }

        const filePath = path.join(TEMP_DIR, filename);
        fs.writeFileSync(filePath, buffer);

        console.log(`✅ Downloaded: ${filename}`);
        return filePath;
    } catch (error) {
        // @ts-ignore
        console.error(`❌ Download error for ${url}:`, error.message);
        return null;
    }
}

async function createAssetFromFile(assetService: AssetService, ctx: any, filePath: string): Promise<ID | null> {
    try {
        // Verifică că fișierul există înainte de a crea stream-ul
        if (!fs.existsSync(filePath)) {
            console.error(`❌ File not found: ${filePath}`);
            return null;
        }

        // Creează un mock file object compatibil cu multer
        const mockFile = createCompatibleStream(filePath);

        const result: CreateAssetResult = await assetService.create(ctx, {
            file: mockFile,
            tags: ['tm251', 'auto-imported', 'schneider-plc'],
        });

        if ('id' in result) {
            console.log(`✅ Asset created: ${result.id}`);
            return result.id;
        } else {
            console.warn(`⚠️ Asset creation failed: ${result.__typename}`);
            return null;
        }
    } catch (error) {
        // @ts-ignore
        console.error(`❌ Asset creation error:`, error.message);
        return null;
    }
}

async function updatetm251ProductsWithAssets() {
    console.log('🚀 Starting tm251 assets update...');

    const csvPath = 'src/DataCSV/sxwasp_batch_import.csv';
    if (!fs.existsSync(csvPath)) {
        console.error(`❌ CSV file not found: ${csvPath}`);
        console.error('💡 Make sure you have the tm251 CSV file in src/DataCSV/tm251_batch_import.csv');
        process.exit(1);
    }

    const app = await bootstrap(config);
    const connection = app.get(TransactionalConnection);
    const ctxService = app.get(RequestContextService);
    const channelService = app.get(ChannelService);
    const productService = app.get(ProductService);
    const assetService = app.get(AssetService);

    const defaultChannel = await channelService.getDefaultChannel();
    const ctx = await ctxService.create({
        apiType: 'admin',
        channelOrToken: defaultChannel.token,
        languageCode: LanguageCode.en,
    });

    const rows: any[] = [];

    return new Promise<void>((resolve, reject) => {
        fs.createReadStream(csvPath)
            .pipe(csv({ separator: ',' }))
            .on('data', (row) => {
                // tm251 CSV folosește assetUrls în loc de assets
                if (!row.sku || !row.assetUrls || row.assetUrls.trim() === '') return;
                rows.push(row);
            })
            .on('end', async () => {
                console.log(`📦 Found ${rows.length} tm251 products with assets to process`);

                let updatedCount = 0;
                let skippedCount = 0;
                let errorCount = 0;

                for (const [index, row] of rows.entries()) {
                    console.log(`\n🔄 Processing tm251 ${index + 1}/${rows.length}: ${row.sku}`);

                    try {
                        // 1. Find product by SKU
                        const variant = await connection.rawConnection
                            .getRepository('product_variant')
                            .createQueryBuilder('variant')
                            .leftJoinAndSelect('variant.product', 'product')
                            .where('variant.sku = :sku', { sku: row.sku })
                            .andWhere('variant.deletedAt IS NULL')
                            .getOne();

                        if (!variant) {
                            console.warn(`⚠️ tm251 Product not found for SKU: ${row.sku}`);
                            skippedCount++;
                            continue;
                        }

                        const productId = variant.product.id;
                        console.log(`🔍 Found tm251 product ID: ${productId}`);

                        // 2. Check if product already has assets
                        const existingProduct = await productService.findOne(ctx, productId);
                        if (existingProduct?.featuredAsset) {
                            console.log(`⚠️ tm251 Product ${row.sku} already has assets, skipping`);
                            skippedCount++;
                            continue;
                        }

                        // 3. Process assets from assetUrls column
                        const assetUrls = row.assetUrls.split('|').map((url: string) => url.trim()).filter(Boolean);
                        console.log(`📸 Found ${assetUrls.length} asset URLs for ${row.sku}`);

                        const assetIds: ID[] = [];
                        const tempFiles: string[] = []; // Track temp files pentru cleanup

                        for (const [assetIndex, url] of assetUrls.entries()) {
                            console.log(`📸 Processing tm251 asset ${assetIndex + 1}/${assetUrls.length}`);

                            // Generate filename with tm251 prefix
                            const extension = url.includes('.jpg') ? '.jpg' :
                                url.includes('.png') ? '.png' : '.jpg';
                            const filename = `tm251_${row.sku}_${assetIndex}_${Date.now()}${extension}`;

                            // Download image
                            const filePath = await downloadImage(url, filename);
                            if (!filePath) {
                                console.warn(`⚠️ Failed to download tm251 asset ${assetIndex + 1}`);
                                continue;
                            }

                            tempFiles.push(filePath); // Track pentru cleanup

                            // Create asset
                            const assetId = await createAssetFromFile(assetService, ctx, filePath);
                            if (assetId) {
                                assetIds.push(assetId);
                                console.log(`✅ tm251 Asset ${assetIndex + 1} created successfully: ${assetId}`);
                            } else {
                                console.warn(`⚠️ Failed to create tm251 asset ${assetIndex + 1}`);
                            }
                        }

                        // 4. Update product with assets
                        if (assetIds.length > 0) {
                            console.log(`🔨 Updating tm251 product with ${assetIds.length} asset(s)`);

                            await productService.update(ctx, {
                                id: productId,
                                featuredAssetId: assetIds[0], // First asset as featured
                                assetIds: assetIds, // All assets
                            });

                            console.log(`✅ Updated tm251 product ${row.sku} with assets: ${assetIds.join(', ')}`);
                            console.log(`   📦 Product: ${row.name}`);
                            console.log(`   🖼️ Featured Asset: ${assetIds[0]}`);
                            console.log(`   📸 Total Assets: ${assetIds.length}`);
                            updatedCount++;
                        } else {
                            console.warn(`⚠️ No assets created for tm251 ${row.sku}`);
                            errorCount++;
                        }

                        // 5. Cleanup temp files DUPĂ ce assets-urile au fost create
                        for (const tempFile of tempFiles) {
                            try {
                                if (fs.existsSync(tempFile)) {
                                    fs.unlinkSync(tempFile);
                                    console.log(`🗑️ Cleaned temp file: ${path.basename(tempFile)}`);
                                }
                            } catch (cleanupError) {
                                // @ts-ignore
                                console.warn(`⚠️ Cleanup warning: ${cleanupError.message}`);
                            }
                        }

                    } catch (error: any) {
                        console.error(`❌ Error processing tm251 ${row.sku}:`, error.message);
                        errorCount++;
                    }
                }

                // Cleanup temp directory
                try {
                    if (fs.existsSync(TEMP_DIR)) {
                        const files = fs.readdirSync(TEMP_DIR);
                        for (const file of files) {
                            fs.unlinkSync(path.join(TEMP_DIR, file));
                        }
                        fs.rmdirSync(TEMP_DIR);
                        console.log('🧹 tm251 temp directory cleaned');
                    }
                } catch {} // Silent fail

                console.log(`\n📊 tm251 Assets Update Summary:`);
                console.log(`   ✅ Updated: ${updatedCount}`);
                console.log(`   ⚠️ Skipped: ${skippedCount}`);
                console.log(`   ❌ Errors: ${errorCount}`);
                console.log(`   📦 Total processed: ${rows.length}`);

                if (updatedCount > 0) {
                    console.log(`\n🎯 tm251 Assets Successfully Processed:`);
                    console.log(`   📦 Product Type: tm251 (Modicon M200 PLCs)`);
                    console.log(`   🏷️ Asset Tags: tm251, auto-imported, schneider-plc`);
                    console.log(`   📸 Images: Downloaded from Schneider servers`);
                    console.log(`   🖼️ Featured Assets: First image set as featured`);
                }

                console.log('🎉 tm251 assets update complete!');

                setTimeout(async () => {
                    await app.close();
                    resolve();
                }, 2000);
            })
            .on('error', reject);
    });
}

updatetm251ProductsWithAssets().catch((err) => {
    console.error('❌ Fatal tm251 assets error:', err);
    process.exit(1);
});