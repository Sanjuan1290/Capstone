function queueSchemaFixture() {
 const indexes=new Map([['uniq_queue_doctor_day_number',{columns:['queue_date','doctor_id','queue_number'],unique:true}]])
 const commands=[]
 return {indexes,commands,async query(sql){
  if(sql==='SHOW INDEX FROM queue')return [[...indexes].flatMap(([Key_name,definition])=>definition.columns.map((Column_name,i)=>({Key_name,Column_name,Seq_in_index:i+1,Non_unique:definition.unique?0:1,Sub_part:null})))]
  const add=/^ALTER TABLE queue ADD (UNIQUE )?KEY (\w+) \(([^)]+)\)/.exec(sql)
  if(add){if(indexes.has(add[2]))throw Error('Duplicate key '+add[2]);indexes.set(add[2],{columns:add[3].split(',').map(c=>c.trim()),unique:Boolean(add[1])});commands.push(sql);return [{affectedRows:1}]}
  const drop=/^ALTER TABLE queue DROP INDEX (\w+)/.exec(sql)
  if(drop){if(!indexes.has(drop[1]))throw Error('Missing index');indexes.delete(drop[1]);commands.push(sql);return [{affectedRows:1}]}
  return null
 }}
}
module.exports={queueSchemaFixture}
