// import {
//     PluginCommonModule,
//     VendurePlugin,
//     EventBus,
//     FacetService,
//     ProductService,
//     ProductVariantService,
//     RequestContext,
//     Logger,
//     ProductEvent,
//     ID,
//     LanguageCode,
//     FacetValueService,
//     ProductVariantEvent
// } from '@vendure/core';
// import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
// import { Subscription } from 'rxjs';
// import { filter, debounceTime, distinctUntilChanged } from 'rxjs/operators';
//
// /**
//  * Service care transformă automat custom fields în facets
//  */
// @Injectable()
// export class AutoFacetsService implements OnModuleInit, OnModuleDestroy {
//     private subscription: Subscription;
//     private processingProducts = new Set<ID>(); // Prevent concurrent processing
//     private processedProducts = new Map<ID, number>(); // Track last processing time
//
//     constructor(
//         private eventBus: EventBus,
//         private facetService: FacetService,
//         private facetValueService: FacetValueService,
//         private productService: ProductService,
//         private productVariantService: ProductVariantService
//     ) {}
//
//     /**
//      * Mapping între custom fields și facets
//      * TOATE proprietățile sunt acum la nivel de Product
//      */
//     private fieldToFacetMapping: Record<string, string> = {
//         // Categorii principale
//         'category': 'Category',
//         'productType': 'Product Type',
//
//         // Proprietăți universale
//         'brand': 'Brand',
//         'voltage': 'Voltage',
//
//         // Circuit Breaker Properties
//         'current': 'Current Rating',
//         'poles': 'Number of Poles',
//         'curve': 'Curve Type',
//         'breakingCapacity': 'Breaking Capacity',
//
//         // PLC Properties
//         'digitalInputs': 'Digital Inputs',
//         'digitalOutputs': 'Digital Outputs',
//         'analogInputs': 'Analog Inputs',
//         'communication': 'Communication',
//         'programmingLanguage': 'Programming Language',
//
//         // Contactor Properties
//         'coilVoltage': 'Coil Voltage',
//         'contactConfiguration': 'Contact Configuration',
//         'ratedCurrent': 'Rated Current'
//     };
//
//     async onModuleInit() {
//         Logger.info('🚀 AutoFacetsService: Starting automatic facet creation service...');
//
//         // Debounce și filtrare pentru evenimente Product
//         const productSubscription = this.eventBus.ofType(ProductEvent).pipe(
//             filter(event => event.type === 'created' || event.type === 'updated'),
//             debounceTime(1000), // Așteaptă 1 secundă între evenimente
//             distinctUntilChanged((prev, curr) => prev.product.id === curr.product.id)
//         ).subscribe(async (event) => {
//             try {
//                 await this.processProductWithLock(event.ctx, event.product.id);
//             } catch (error: any) {
//                 Logger.error(`Error processing product facets: ${error.message}`, 'AutoFacetsService');
//             }
//         });
//
//         // Debounce pentru evenimente ProductVariant
//         const variantSubscription = this.eventBus.ofType(ProductVariantEvent).pipe(
//             filter(event => event.type === 'created' || event.type === 'updated'),
//             debounceTime(1000),
//             distinctUntilChanged((prev, curr) => {
//                 const prevVariant = prev.variants[0];
//                 const currVariant = curr.variants[0];
//                 return prevVariant?.productId === currVariant?.productId;
//             })
//         ).subscribe(async (event) => {
//             try {
//                 const variant = event.variants[0];
//                 if (variant && variant.productId) {
//                     await this.processProductWithLock(event.ctx, variant.productId);
//                 }
//             } catch (error: any) {
//                 Logger.error(`Error processing variant facets: ${error.message}`, 'AutoFacetsService');
//             }
//         });
//
//         this.subscription = new Subscription();
//         this.subscription.add(productSubscription);
//         this.subscription.add(variantSubscription);
//     }
//
//     async onModuleDestroy() {
//         if (this.subscription) {
//             this.subscription.unsubscribe();
//         }
//     }
//
//     /**
//      * Procesează produs cu lock pentru a preveni procesarea concurentă
//      */
//     private async processProductWithLock(ctx: RequestContext, productId: ID) {
//         // Verifică dacă produsul este deja în procesare
//         if (this.processingProducts.has(productId)) {
//             Logger.debug(`Product ${productId} is already being processed, skipping...`);
//             return;
//         }
//
//         // Verifică dacă produsul a fost procesat recent (ultimele 5 secunde)
//         const lastProcessed = this.processedProducts.get(productId);
//         const now = Date.now();
//         if (lastProcessed && (now - lastProcessed) < 5000) {
//             Logger.debug(`Product ${productId} was processed recently, skipping...`);
//             return;
//         }
//
//         // Marchează produsul ca fiind în procesare
//         this.processingProducts.add(productId);
//         this.processedProducts.set(productId, now);
//
//         try {
//             await this.processProductForFacets(ctx, productId);
//         } finally {
//             // Elimină lock-ul
//             this.processingProducts.delete(productId);
//         }
//     }
//
//     /**
//      * Procesează un produs și creează facets pe baza custom fields-urilor
//      * DOAR la nivel de Product - proprietățile tehnice sunt pe Product!
//      */
//     private async processProductForFacets(ctx: RequestContext, productId: ID) {
//         Logger.info(`🔍 Processing product ${productId} for automatic facet creation...`);
//
//         const product = await this.productService.findOne(ctx, productId, ['variants']);
//         if (!product) {
//             Logger.warn(`Product ${productId} not found`);
//             return;
//         }
//
//         Logger.info(`📦 Product ${productId} has ${product.variants?.length || 0} variants`);
//         Logger.info(`📦 Product custom fields:`, JSON.stringify(product.customFields, null, 2));
//
//         // Procesează DOAR custom fields de la Product (include TOATE proprietățile tehnice)
//         if (product.customFields) {
//             await this.processCustomFields(ctx, product.customFields, productId, 'product');
//         } else {
//             Logger.warn(`⚠️  Product ${productId} has no custom fields`);
//         }
//
//         Logger.info(`✅ Completed facet processing for product ${productId}`);
//         Logger.info(`🎯 DUAL ASSIGNMENT: Facets visible in BOTH places!`);
//         Logger.info(`   📍 Admin UI: Product page → Facets section (right panel)`);
//         Logger.info(`   📍 Frontend: product.variants[0].facetValues (Angular compatible)`);
//         Logger.info(`   📍 Catalog → Facets → to see all generated facet categories`);
//         Logger.info(`🚀 Dual assignment completed - Admin UI + Frontend compatibility!`);
//     }
//
//     /**
//      * Procesează custom fields și creează/actualizează facets
//      */
//     private async processCustomFields(
//         ctx: RequestContext,
//         customFields: Record<string, any>,
//         productId: ID,
//         entityType: 'product' | 'variant',
//         variantId?: ID
//     ) {
//         Logger.info(`🔍 Processing ${entityType} custom fields for ${entityType === 'variant' ? 'variant ' + variantId : 'product ' + productId}`);
//         // Logger.info(`📋 Available custom fields:`, Object.keys(customFields));
//
//         for (const [fieldName, fieldValue] of Object.entries(customFields)) {
//             Logger.info(`🔎 Processing field: ${fieldName} = ${fieldValue}`);
//
//             if (!fieldValue || fieldValue === '') {
//                 Logger.info(`⏭️  Skipping empty field: ${fieldName}`);
//                 continue;
//             }
//
//             const facetName = this.fieldToFacetMapping[fieldName];
//             if (!facetName) {
//                 Logger.info(`⏭️  No mapping found for field: ${fieldName}`);
//                 continue;
//             }
//
//             Logger.info(`🎯 Mapping ${fieldName} → ${facetName}`);
//
//             try {
//                 // Creează sau găsește facet-ul
//                 const facet = await this.getOrCreateFacet(ctx, facetName, fieldName);
//
//                 // Creează sau găsește facet value
//                 const facetValue = await this.getOrCreateFacetValue(ctx, facet.id, String(fieldValue));
//
//                 // Assign facet value la produs (doar dacă nu există deja)
//                 await this.assignFacetValueToProduct(ctx, productId, facetValue.id, variantId);
//
//                 Logger.info(`✅ ${entityType} ${fieldName}="${fieldValue}" → Facet "${facetName}" processed successfully`);
//             } catch (error: any) {
//                 Logger.error(`❌ Error processing field ${fieldName}: ${error.message}`, 'AutoFacetsService');
//             }
//         }
//     }
//
//     /**
//      * Găsește sau creează un facet cu retry logic
//      */
//     private async getOrCreateFacet(ctx: RequestContext, facetName: string, fieldCode: string) {
//         // Încearcă să găsească facet existent
//         const existingFacets = await this.facetService.findAll(ctx, {});
//         const existingFacet = existingFacets.items.find(f => f.name === facetName);
//
//         if (existingFacet) {
//             return existingFacet;
//         }
//
//         try {
//             // Creează facet nou
//             Logger.info(`🆕 Creating new facet: ${facetName}`);
//             const newFacet = await this.facetService.create(ctx, {
//                 code: fieldCode.toLowerCase().replace(/[^a-z0-9]/g, '-'),
//                 translations: [
//                     {
//                         languageCode: LanguageCode.en,
//                         name: facetName
//                     }
//                 ],
//                 isPrivate: false
//             });
//
//             return newFacet;
//         } catch (error: any) {
//             if (error.message && error.message.includes('duplicate key')) {
//                 // Retry în caz de conflict
//                 const refetchedFacets = await this.facetService.findAll(ctx, {});
//                 const retryFacet = refetchedFacets.items.find(f => f.name === facetName);
//                 if (retryFacet) {
//                     return retryFacet;
//                 }
//             }
//             throw error;
//         }
//     }
//
//     /**
//      * Găsește sau creează un facet value cu retry logic
//      */
//     private async getOrCreateFacetValue(ctx: RequestContext, facetId: ID, valueCode: string) {
//         const facet = await this.facetService.findOne(ctx, facetId, ['values']);
//         if (!facet) {
//             throw new Error(`Facet ${facetId} not found`);
//         }
//
//         const normalizedCode = valueCode.toLowerCase().replace(/[^a-z0-9]/g, '-');
//
//         // Verifică dacă value-ul există deja
//         const existingValue = facet.values.find(v =>
//             v.code === normalizedCode ||
//             v.name === valueCode ||
//             v.code === valueCode.toLowerCase()
//         );
//         if (existingValue) {
//             return existingValue;
//         }
//
//         try {
//             // Creează value nou
//             Logger.info(`🆕 Creating new facet value: ${valueCode} for facet ${facet.name}`);
//
//             const newValue = await this.facetValueService.create(ctx, facet, {
//                 code: normalizedCode,
//                 translations: [
//                     {
//                         languageCode: LanguageCode.en,
//                         name: valueCode
//                     }
//                 ]
//             });
//
//             return newValue;
//         } catch (error: any) {
//             if (error.message && error.message.includes('duplicate key')) {
//                 // Retry în caz de conflict
//                 const refetchedFacet = await this.facetService.findOne(ctx, facetId, ['values']);
//                 const retryValue = refetchedFacet?.values.find(v => v.name === valueCode);
//                 if (retryValue) {
//                     return retryValue;
//                 }
//             }
//             throw error;
//         }
//     }
//
//     /**
//      * DUAL ASSIGNMENT: Assign facet value la BOTH Product ȘI ProductVariant
//      * - Product: pentru Admin UI Facets panel
//      * - ProductVariant: pentru Frontend Angular compatibility
//      */
//     private async assignFacetValueToProduct(
//         ctx: RequestContext,
//         productId: ID,
//         facetValueId: ID,
//         variantId?: ID
//     ) {
//         try {
//             // Get the facet this value belongs to
//             const facetValue = await this.facetValueService.findOne(ctx, facetValueId);
//             if (!facetValue) {
//                 Logger.warn(`FacetValue ${facetValueId} not found`);
//                 return;
//             }
//             const facetId = facetValue.facet.id;
//
//             // 1. ASSIGN LA PRODUCT (pentru Admin UI)
//             const product = await this.productService.findOne(ctx, productId, ['facetValues', 'facetValues.facet']);
//             if (product) {
//                 const currentProductFacetValues = product.facetValues || [];
//
//                 // Remove any existing facet values from the same facet
//                 const filteredFacetValues = currentProductFacetValues.filter(fv => fv.facet.id !== facetId);
//
//                 // Add the new facet value
//                 const newProductFacetValueIds = [...filteredFacetValues.map(fv => fv.id), facetValueId];
//
//                 await this.productService.update(ctx, {
//                     id: productId,
//                     facetValueIds: newProductFacetValueIds
//                 });
//                 Logger.info(`✅ Updated facet value ${facetValueId} for PRODUCT ${productId} (replaced existing values for facet ${facetId})`);
//             }
//
//             // 2. ASSIGN LA PRODUCTVARIANT (pentru Frontend Angular)
//             const targetVariantId = variantId || await this.getFirstVariantId(ctx, productId);
//             if (targetVariantId) {
//                 const variant = await this.productVariantService.findOne(ctx, targetVariantId, ['facetValues', 'facetValues.facet']);
//                 if (variant) {
//                     const currentVariantFacetValues = variant.facetValues || [];
//
//                     // Remove any existing facet values from the same facet
//                     const filteredVariantFacetValues = currentVariantFacetValues.filter(fv => fv.facet.id !== facetId);
//
//                     // Add the new facet value
//                     const newVariantFacetValueIds = [...filteredVariantFacetValues.map(fv => fv.id), facetValueId];
//
//                     await this.productVariantService.update(ctx, [{
//                         id: targetVariantId,
//                         facetValueIds: newVariantFacetValueIds
//                     }]);
//                     Logger.info(`✅ Updated facet value ${facetValueId} for VARIANT ${targetVariantId} (replaced existing values for facet ${facetId})`);
//                 }
//             }
//
//         } catch (error: any) {
//             if (error.message && error.message.includes('duplicate key')) {
//                 Logger.debug(`Facet value ${facetValueId} already assigned (race condition)`);
//                 return;
//             }
//             Logger.warn(`Could not assign facet value ${facetValueId}: ${error.message}`);
//         }
//     }
//
//     /**
//      * Helper pentru a obține prima variantă a unui produs (needed pentru dual assignment)
//      */
//     private async getFirstVariantId(ctx: RequestContext, productId: ID): Promise<ID | null> {
//         const product = await this.productService.findOne(ctx, productId, ['variants']);
//         return product?.variants?.[0]?.id || null;
//     }
//
//     /**
//      * Utility method pentru debugging
//      */
//     async debugProductFacets(ctx: RequestContext, productId: ID) {
//         const product = await this.productService.findOne(ctx, productId, ['variants']);
//         if (!product) {
//             Logger.warn(`Product ${productId} not found`);
//             return;
//         }
//
//         Logger.info(`=== Debug Product ${productId} ===`);
//         Logger.info(`Product custom fields:`, JSON.stringify(product.customFields, null, 2));
//
//         if (product.variants) {
//             for (const variant of product.variants) {
//                 const fullVariant = await this.productVariantService.findOne(ctx, variant.id, ['facetValues']);
//                 Logger.info(`Variant ${variant.id} custom fields:`, JSON.stringify(fullVariant?.customFields, null, 2));
//
//                 const facetValueNames = fullVariant?.facetValues?.map(fv => `${fv.name} (${fv.code})`) || [];
//                 Logger.info(`Variant ${variant.id} facet values:`, facetValueNames.join(', '));
//             }
//         }
//     }
// }
//
// /**
//  * Plugin principal pentru auto-crearea facets-urilor
//  */
// @VendurePlugin({
//     imports: [PluginCommonModule],
//     providers: [AutoFacetsService],
//     compatibility: '^3.0.0 || ^2.0.0',
// })
// export class AutoFacetsPlugin {
//     static init() {
//         Logger.info('🎯 AutoFacetsPlugin: Plugin initialized with debouncing and locking');
//         return AutoFacetsPlugin;
//     }
// }

import {
    PluginCommonModule,
    VendurePlugin,
    EventBus,
    FacetService,
    ProductService,
    ProductVariantService,
    RequestContext,
    Logger,
    ProductEvent,
    ID,
    LanguageCode,
    FacetValueService,
    ProductVariantEvent
} from '@vendure/core';
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Subscription } from 'rxjs';
import { filter, debounceTime, distinctUntilChanged } from 'rxjs/operators';

/**
 * Service care transformă automat custom fields în facets
 */
@Injectable()
export class AutoFacetsService implements OnModuleInit, OnModuleDestroy {
    private subscription: Subscription;
    private processingProducts = new Set<ID>(); // Prevent concurrent processing
    private processedProducts = new Map<ID, number>(); // Track last processing time

    constructor(
        private eventBus: EventBus,
        private facetService: FacetService,
        private facetValueService: FacetValueService,
        private productService: ProductService,
        private productVariantService: ProductVariantService
    ) {}

    /**
     * Mapping între custom fields și facets
     * TOATE proprietățile sunt acum la nivel de Product
     */
    private fieldToFacetMapping: Record<string, string> = {
        // Categorii principale
        'category': 'Category',
        'productType': 'Product Type',

        // Proprietăți universale
        'brand': 'Brand',
        'voltage': 'Voltage',

        // Circuit Breaker Properties
        'current': 'Current Rating',
        'poles': 'Number of Poles',
        'curve': 'Curve Type',
        'breakingCapacity': 'Breaking Capacity',

        // PLC Properties
        'digitalInputs': 'Digital Inputs',
        'digitalOutputs': 'Digital Outputs',
        'analogInputs': 'Analog Inputs',
        'communication': 'Communication',
        'programmingLanguage': 'Programming Language',

        // Contactor Properties
        'coilVoltage': 'Coil Voltage',
        'contactConfiguration': 'Contact Configuration',
        'ratedCurrent': 'Rated Current',

        // ✨ DIMENSIONS FACETS ✨
        'height': 'Height',
        'width': 'Width',
        'depth': 'Depth',
        'weight': 'Weight',

        // ✨ STOCK STATUS FACET ✨ (ADAUGĂ ACEASTĂ LINIE)
        'stockStatus': 'Stock Status'
    };

    async onModuleInit() {
        Logger.info('🚀 AutoFacetsService: Starting automatic facet creation service...');

        // Debounce și filtrare pentru evenimente Product
        const productSubscription = this.eventBus.ofType(ProductEvent).pipe(
            filter(event => event.type === 'created' || event.type === 'updated'),
            debounceTime(1000), // Așteaptă 1 secundă între evenimente
            distinctUntilChanged((prev, curr) => prev.product.id === curr.product.id)
        ).subscribe(async (event) => {
            try {
                await this.processProductWithLock(event.ctx, event.product.id);
            } catch (error: any) {
                Logger.error(`Error processing product facets: ${error.message}`, 'AutoFacetsService');
            }
        });

        // Debounce pentru evenimente ProductVariant
        const variantSubscription = this.eventBus.ofType(ProductVariantEvent).pipe(
            filter(event => event.type === 'created' || event.type === 'updated'),
            debounceTime(1000),
            distinctUntilChanged((prev, curr) => {
                const prevVariant = prev.variants[0];
                const currVariant = curr.variants[0];
                return prevVariant?.productId === currVariant?.productId;
            })
        ).subscribe(async (event) => {
            try {
                const variant = event.variants[0];
                if (variant && variant.productId) {
                    await this.processProductWithLock(event.ctx, variant.productId);
                }
            } catch (error: any) {
                Logger.error(`Error processing variant facets: ${error.message}`, 'AutoFacetsService');
            }
        });

        this.subscription = new Subscription();
        this.subscription.add(productSubscription);
        this.subscription.add(variantSubscription);
    }

    async onModuleDestroy() {
        if (this.subscription) {
            this.subscription.unsubscribe();
        }
    }

    /**
     * PUBLIC METHOD: Manually process a product for facets (for import scripts)
     */
    async manuallyProcessProduct(ctx: RequestContext, productId: ID) {
        Logger.info(`🔧 Manually processing product ${productId} for facets...`);
        return await this.processProductForFacets(ctx, productId);
    }

    /**
     * Procesează produs cu lock pentru a preveni procesarea concurentă
     */
    private async processProductWithLock(ctx: RequestContext, productId: ID) {
        // Verifică dacă produsul este deja în procesare
        if (this.processingProducts.has(productId)) {
            Logger.debug(`Product ${productId} is already being processed, skipping...`);
            return;
        }

        // Verifică dacă produsul a fost procesat recent (ultimele 5 secunde)
        const lastProcessed = this.processedProducts.get(productId);
        const now = Date.now();
        if (lastProcessed && (now - lastProcessed) < 5000) {
            Logger.debug(`Product ${productId} was processed recently, skipping...`);
            return;
        }

        // Marchează produsul ca fiind în procesare
        this.processingProducts.add(productId);
        this.processedProducts.set(productId, now);

        try {
            await this.processProductForFacets(ctx, productId);
        } finally {
            // Elimină lock-ul
            this.processingProducts.delete(productId);
        }
    }

    /**
     * Procesează un produs și creează facets pe baza custom fields-urilor
     * DOAR la nivel de Product - proprietățile tehnice sunt pe Product!
     */
    private async processProductForFacets(ctx: RequestContext, productId: ID) {
        Logger.info(`🔍 Processing product ${productId} for automatic facet creation...`);

        const product = await this.productService.findOne(ctx, productId, ['variants']);
        if (!product) {
            Logger.warn(`Product ${productId} not found`);
            return;
        }

        Logger.info(`📦 Product ${productId} has ${product.variants?.length || 0} variants`);
        Logger.info(`📦 Product custom fields:`, JSON.stringify(product.customFields, null, 2));

        // Procesează DOAR custom fields de la Product (include TOATE proprietățile tehnice)
        if (product.customFields) {
            await this.processCustomFields(ctx, product.customFields, productId, 'product');
        } else {
            Logger.warn(`⚠️  Product ${productId} has no custom fields`);
        }

        Logger.info(`✅ Completed facet processing for product ${productId}`);
        Logger.info(`🎯 DUAL ASSIGNMENT: Facets visible in BOTH places!`);
        Logger.info(`   📍 Admin UI: Product page → Facets section (right panel)`);
        Logger.info(`   📍 Frontend: product.variants[0].facetValues (Angular compatible)`);
        Logger.info(`   📍 Catalog → Facets → to see all generated facet categories`);
        Logger.info(`🚀 Dual assignment completed - Admin UI + Frontend compatibility!`);
    }

    /**
     * Procesează custom fields și creează/actualizează facets
     */
    private async processCustomFields(
        ctx: RequestContext,
        customFields: Record<string, any>,
        productId: ID,
        entityType: 'product' | 'variant',
        variantId?: ID
    ) {
        Logger.info(`🔍 Processing ${entityType} custom fields for ${entityType === 'variant' ? 'variant ' + variantId : 'product ' + productId}`);
        // Logger.info(`📋 Available custom fields:`, Object.keys(customFields));

        for (const [fieldName, fieldValue] of Object.entries(customFields)) {
            Logger.info(`🔎 Processing field: ${fieldName} = ${fieldValue}`);

            if (!fieldValue || fieldValue === '') {
                Logger.info(`⏭️  Skipping empty field: ${fieldName}`);
                continue;
            }

            const facetName = this.fieldToFacetMapping[fieldName];
            if (!facetName) {
                Logger.info(`⏭️  No mapping found for field: ${fieldName}`);
                continue;
            }

            Logger.info(`🎯 Mapping ${fieldName} → ${facetName}`);

            try {
                // Creează sau găsește facet-ul
                const facet = await this.getOrCreateFacet(ctx, facetName, fieldName);

                // Creează sau găsește facet value
                const facetValue = await this.getOrCreateFacetValue(ctx, facet.id, String(fieldValue));

                // Assign facet value la produs (doar dacă nu există deja)
                await this.assignFacetValueToProduct(ctx, productId, facetValue.id, variantId);

                Logger.info(`✅ ${entityType} ${fieldName}="${fieldValue}" → Facet "${facetName}" processed successfully`);
            } catch (error: any) {
                Logger.error(`❌ Error processing field ${fieldName}: ${error.message}`, 'AutoFacetsService');
            }
        }
    }

    /**
     * Găsește sau creează un facet cu retry logic
     */
    private async getOrCreateFacet(ctx: RequestContext, facetName: string, fieldCode: string) {
        // Încearcă să găsească facet existent
        const existingFacets = await this.facetService.findAll(ctx, {});
        const existingFacet = existingFacets.items.find(f => f.name === facetName);

        if (existingFacet) {
            return existingFacet;
        }

        try {
            // Creează facet nou
            Logger.info(`🆕 Creating new facet: ${facetName}`);
            const newFacet = await this.facetService.create(ctx, {
                code: fieldCode.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                translations: [
                    {
                        languageCode: LanguageCode.en,
                        name: facetName
                    }
                ],
                isPrivate: false
            });

            return newFacet;
        } catch (error: any) {
            if (error.message && error.message.includes('duplicate key')) {
                // Retry în caz de conflict
                const refetchedFacets = await this.facetService.findAll(ctx, {});
                const retryFacet = refetchedFacets.items.find(f => f.name === facetName);
                if (retryFacet) {
                    return retryFacet;
                }
            }
            throw error;
        }
    }

    /**
     * Găsește sau creează un facet value cu retry logic
     */
    private async getOrCreateFacetValue(ctx: RequestContext, facetId: ID, valueCode: string) {
        const facet = await this.facetService.findOne(ctx, facetId, ['values']);
        if (!facet) {
            throw new Error(`Facet ${facetId} not found`);
        }

        const normalizedCode = valueCode.toLowerCase().replace(/[^a-z0-9]/g, '-');

        // Verifică dacă value-ul există deja
        const existingValue = facet.values.find(v =>
            v.code === normalizedCode ||
            v.name === valueCode ||
            v.code === valueCode.toLowerCase()
        );
        if (existingValue) {
            return existingValue;
        }

        try {
            // Creează value nou
            Logger.info(`🆕 Creating new facet value: ${valueCode} for facet ${facet.name}`);

            const newValue = await this.facetValueService.create(ctx, facet, {
                code: normalizedCode,
                translations: [
                    {
                        languageCode: LanguageCode.en,
                        name: valueCode
                    }
                ]
            });

            return newValue;
        } catch (error: any) {
            if (error.message && error.message.includes('duplicate key')) {
                // Retry în caz de conflict
                const refetchedFacet = await this.facetService.findOne(ctx, facetId, ['values']);
                const retryValue = refetchedFacet?.values.find(v => v.name === valueCode);
                if (retryValue) {
                    return retryValue;
                }
            }
            throw error;
        }
    }

    /**
     * DUAL ASSIGNMENT: Assign facet value la BOTH Product ȘI ProductVariant
     * - Product: pentru Admin UI Facets panel
     * - ProductVariant: pentru Frontend Angular compatibility
     */
    private async assignFacetValueToProduct(
        ctx: RequestContext,
        productId: ID,
        facetValueId: ID,
        variantId?: ID
    ) {
        try {
            // Get the facet this value belongs to
            const facetValue = await this.facetValueService.findOne(ctx, facetValueId);
            if (!facetValue) {
                Logger.warn(`FacetValue ${facetValueId} not found`);
                return;
            }
            const facetId = facetValue.facet.id;

            // 1. ASSIGN LA PRODUCT (pentru Admin UI)
            const product = await this.productService.findOne(ctx, productId, ['facetValues', 'facetValues.facet']);
            if (product) {
                const currentProductFacetValues = product.facetValues || [];

                // Remove any existing facet values from the same facet
                const filteredFacetValues = currentProductFacetValues.filter(fv => fv.facet.id !== facetId);

                // Add the new facet value
                const newProductFacetValueIds = [...filteredFacetValues.map(fv => fv.id), facetValueId];

                await this.productService.update(ctx, {
                    id: productId,
                    facetValueIds: newProductFacetValueIds
                });
                Logger.info(`✅ Updated facet value ${facetValueId} for PRODUCT ${productId} (replaced existing values for facet ${facetId})`);
            }

            // 2. ASSIGN LA PRODUCTVARIANT (pentru Frontend Angular)
            const targetVariantId = variantId || await this.getFirstVariantId(ctx, productId);
            if (targetVariantId) {
                const variant = await this.productVariantService.findOne(ctx, targetVariantId, ['facetValues', 'facetValues.facet']);
                if (variant) {
                    const currentVariantFacetValues = variant.facetValues || [];

                    // Remove any existing facet values from the same facet
                    const filteredVariantFacetValues = currentVariantFacetValues.filter(fv => fv.facet.id !== facetId);

                    // Add the new facet value
                    const newVariantFacetValueIds = [...filteredVariantFacetValues.map(fv => fv.id), facetValueId];

                    await this.productVariantService.update(ctx, [{
                        id: targetVariantId,
                        facetValueIds: newVariantFacetValueIds
                    }]);
                    Logger.info(`✅ Updated facet value ${facetValueId} for VARIANT ${targetVariantId} (replaced existing values for facet ${facetId})`);
                }
            }

        } catch (error: any) {
            if (error.message && error.message.includes('duplicate key')) {
                Logger.debug(`Facet value ${facetValueId} already assigned (race condition)`);
                return;
            }
            Logger.warn(`Could not assign facet value ${facetValueId}: ${error.message}`);
        }
    }

    /**
     * Helper pentru a obține prima variantă a unui produs (needed pentru dual assignment)
     */
    private async getFirstVariantId(ctx: RequestContext, productId: ID): Promise<ID | null> {
        const product = await this.productService.findOne(ctx, productId, ['variants']);
        return product?.variants?.[0]?.id || null;
    }

    /**
     * PUBLIC METHOD: Force process ALL products for facets (useful for batch processing)
     */
    async processAllProducts(ctx: RequestContext) {
        Logger.info('🔄 Starting batch processing of all products for facets...');

        const allProducts = await this.productService.findAll(ctx, {
            take: 1000, // Procesează în batches de 1000
            skip: 0
        });

        Logger.info(`📊 Found ${allProducts.totalItems} products to process`);

        let processed = 0;
        for (const product of allProducts.items) {
            try {
                await this.processProductForFacets(ctx, product.id);
                processed++;
                Logger.info(`✅ Processed ${processed}/${allProducts.totalItems} products`);
            } catch (error: any) {
                Logger.error(`❌ Error processing product ${product.id}: ${error.message}`);
            }
        }

        Logger.info(`🎉 Batch processing completed! Processed ${processed} products`);
    }

    /**
     * PUBLIC METHOD: Force process a specific product (bypass all locks and debouncing)
     */
    async forceProcessProduct(ctx: RequestContext, productId: ID) {
        Logger.info(`🔧 Force processing product ${productId} (bypassing locks)...`);

        // Bypass toate lock-urile și procesează direct
        try {
            await this.processProductForFacets(ctx, productId);
            Logger.info(`✅ Force processing completed for product ${productId}`);
        } catch (error: any) {
            Logger.error(`❌ Force processing failed for product ${productId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Utility method pentru debugging
     */
    async debugProductFacets(ctx: RequestContext, productId: ID) {
        const product = await this.productService.findOne(ctx, productId, ['variants']);
        if (!product) {
            Logger.warn(`Product ${productId} not found`);
            return;
        }

        Logger.info(`=== Debug Product ${productId} ===`);
        Logger.info(`Product custom fields:`, JSON.stringify(product.customFields, null, 2));

        if (product.variants) {
            for (const variant of product.variants) {
                const fullVariant = await this.productVariantService.findOne(ctx, variant.id, ['facetValues']);
                Logger.info(`Variant ${variant.id} custom fields:`, JSON.stringify(fullVariant?.customFields, null, 2));

                const facetValueNames = fullVariant?.facetValues?.map(fv => `${fv.name} (${fv.code})`) || [];
                Logger.info(`Variant ${variant.id} facet values:`, facetValueNames.join(', '));
            }
        }
    }
}

/**
 * Plugin principal pentru auto-crearea facets-urilor
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [AutoFacetsService],
    compatibility: '^3.0.0 || ^2.0.0',
})
export class AutoFacetsPlugin {
    static init() {
        Logger.info('🎯 AutoFacetsPlugin: Plugin initialized with debouncing and locking');
        return AutoFacetsPlugin;
    }
}