// src/config/shopify-agentic-fields.ts

export type FieldCertainty = 
  | 'verified_shopify_defined'
  | 'standard_product_taxonomy'
  | 'category_attribute'
  | 'catalog_mapping_target'
  | 'searchlift_supplemental'
  | 'research_required';

export interface AgenticFieldConfig {
  key: string;
  label: string;
  dataType: 'string' | 'list' | 'boolean' | 'number';
  certainty: FieldCertainty;
  generationType: 'factual_extracted' | 'ai_generated';
  safeToGenerateAuto: boolean;
  requiresMerchantReview: boolean;
  sourcePriority: string[];
}

export const shopifyAgenticFields: Record<string, AgenticFieldConfig> = {
  // Shopify Standard Taxonomy & Category Attributes
  'shopify.product_category': {
    key: 'shopify.product_category',
    label: 'Standard Product Taxonomy',
    dataType: 'string',
    certainty: 'standard_product_taxonomy',
    generationType: 'factual_extracted',
    safeToGenerateAuto: false, // Must be accurate to unlock standard fields
    requiresMerchantReview: true,
    sourcePriority: ['title', 'body_html', 'tags']
  },
  'shopify.material': {
    key: 'shopify.material',
    label: 'Material / Fabric',
    dataType: 'string',
    certainty: 'category_attribute',
    generationType: 'factual_extracted',
    safeToGenerateAuto: true,
    requiresMerchantReview: true,
    sourcePriority: ['body_html', 'metafields.custom.material']
  },
  'shopify.color': {
    key: 'shopify.color',
    label: 'Color',
    dataType: 'string',
    certainty: 'category_attribute',
    generationType: 'factual_extracted',
    safeToGenerateAuto: true,
    requiresMerchantReview: false,
    sourcePriority: ['title', 'body_html', 'variants.option1']
  },
  'shopify.pattern': {
    key: 'shopify.pattern',
    label: 'Pattern',
    dataType: 'string',
    certainty: 'category_attribute',
    generationType: 'factual_extracted',
    safeToGenerateAuto: true,
    requiresMerchantReview: false,
    sourcePriority: ['title', 'body_html']
  },
  'shopify.size': {
    key: 'shopify.size',
    label: 'Size / Dimensions',
    dataType: 'string',
    certainty: 'category_attribute',
    generationType: 'factual_extracted',
    safeToGenerateAuto: false,
    requiresMerchantReview: true,
    sourcePriority: ['variants', 'body_html']
  },
  'shopify.fit': {
    key: 'shopify.fit',
    label: 'Fit / Silhouette',
    dataType: 'string',
    certainty: 'category_attribute',
    generationType: 'factual_extracted',
    safeToGenerateAuto: true,
    requiresMerchantReview: true,
    sourcePriority: ['body_html']
  },
  'shopify.care_guide': {
    key: 'shopify.care_guide',
    label: 'Care Instructions',
    dataType: 'string',
    certainty: 'category_attribute',
    generationType: 'factual_extracted',
    safeToGenerateAuto: false,
    requiresMerchantReview: true,
    sourcePriority: ['body_html']
  },
  'shopify.country_of_origin': {
    key: 'shopify.country_of_origin',
    label: 'Country of Origin',
    dataType: 'string',
    certainty: 'verified_shopify_defined',
    generationType: 'factual_extracted',
    safeToGenerateAuto: false,
    requiresMerchantReview: true, // Legal implications if incorrect
    sourcePriority: ['body_html']
  },
  'shopify.gender': {
    key: 'shopify.gender',
    label: 'Gender / Target Audience',
    dataType: 'string',
    certainty: 'verified_shopify_defined',
    generationType: 'factual_extracted',
    safeToGenerateAuto: true,
    requiresMerchantReview: false,
    sourcePriority: ['title', 'body_html']
  },
  'shopify.age_group': {
    key: 'shopify.age_group',
    label: 'Age Group',
    dataType: 'string',
    certainty: 'verified_shopify_defined',
    generationType: 'factual_extracted',
    safeToGenerateAuto: true,
    requiresMerchantReview: false,
    sourcePriority: ['title', 'body_html']
  },
  
  // Potential future standard fields (Marked as research required)
  'shopify.certifications': {
    key: 'shopify.certifications',
    label: 'Certifications',
    dataType: 'list',
    certainty: 'research_required',
    generationType: 'factual_extracted',
    safeToGenerateAuto: false,
    requiresMerchantReview: true,
    sourcePriority: ['body_html']
  },

  // SearchLift Supplemental Fields
  'custom.ai_summary': {
    key: 'custom.ai_summary',
    label: 'AI-Facing Product Summary',
    dataType: 'string',
    certainty: 'searchlift_supplemental',
    generationType: 'ai_generated',
    safeToGenerateAuto: true,
    requiresMerchantReview: false, // Neutral copy is low risk
    sourcePriority: ['claude_synthesis']
  },
  'custom.ai_questions': {
    key: 'custom.ai_questions',
    label: 'Buyer FAQ Array',
    dataType: 'list',
    certainty: 'searchlift_supplemental',
    generationType: 'ai_generated',
    safeToGenerateAuto: true,
    requiresMerchantReview: false,
    sourcePriority: ['claude_synthesis']
  },
  'custom.occasion': {
    key: 'custom.occasion',
    label: 'Occasion / Use Case',
    dataType: 'string',
    certainty: 'searchlift_supplemental',
    generationType: 'ai_generated',
    safeToGenerateAuto: true,
    requiresMerchantReview: false,
    sourcePriority: ['claude_synthesis']
  }
};
