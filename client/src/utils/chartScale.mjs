export function chartDomain(values) {
  const numbers=values.map(Number).filter(Number.isFinite)
  const min=Math.min(0,...numbers),max=Math.max(0,...numbers)
  return {min,max:max===min?min+1:max}
}
export const chartFraction=(value,{min,max})=>(Number(value||0)-min)/(max-min)
