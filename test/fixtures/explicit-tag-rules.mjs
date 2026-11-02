// Small, explicitly configured test input; never imported by runtime source or shipped in npm.
export const loadRule={最近很累:{words:['好累'],advice:'Synthetic workload note'}};
export function withLoadRule(options={}){
  return {...options,config:{...options.config,extraRules:{...loadRule,...options.config?.extraRules}}};
}
