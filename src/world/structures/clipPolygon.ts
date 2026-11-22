export type Vertex=[number,number,number];
export function clip(polygon:Vertex[],distance:(v:Vertex)=>number) {
  const result:Vertex[]=[];
  for(let i=0;i<polygon.length;i++) {
    const a=polygon[i]!,b=polygon[(i+1)%polygon.length]!,da=distance(a),db=distance(b);
    if(da>=0)result.push(a);
    if((da>=0)!==(db>=0)) {
      const t=da/(da-db);result.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]);
    }
  }
  return result;
}
