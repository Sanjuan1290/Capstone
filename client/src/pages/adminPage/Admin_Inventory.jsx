import { useState } from "react"
import {
  MdSearch, MdClose, MdInventory2, MdWarning,
  MdArrowUpward, MdArrowDownward, MdHistory,
  MdTrendingDown, MdAdd, MdScience, MdLocalPharmacy,
  MdCleaningServices, MdCategory, MdEdit, MdBarChart
} from "react-icons/md"

const items = [
  { id:"ITM-001", barcode:"8850001001234", name:"Tretinoin 0.025% Cream",  category:"Derma",    unit:"tube",   stock:3,  threshold:5,  price:450,  supplier:"Dermacare PH"    },
  { id:"ITM-002", barcode:"8850001002345", name:"Clindamycin Gel 1%",      category:"Derma",    unit:"tube",   stock:12, threshold:8,  price:280,  supplier:"Dermacare PH"    },
  { id:"ITM-003", barcode:"8850001003456", name:"Hydroquinone 2% Cream",   category:"Derma",    unit:"tube",   stock:2,  threshold:5,  price:320,  supplier:"Dermacare PH"    },
  { id:"ITM-004", barcode:"8850001004567", name:"Sunscreen SPF 50",        category:"Derma",    unit:"bottle", stock:7,  threshold:5,  price:560,  supplier:"Dermacare PH"    },
  { id:"ITM-005", barcode:"8850002001234", name:"Amoxicillin 500mg",       category:"Medicine", unit:"box",    stock:8,  threshold:10, price:95,   supplier:"MedPhil Supply"  },
  { id:"ITM-006", barcode:"8850002002345", name:"Amlodipine 5mg",          category:"Medicine", unit:"box",    stock:15, threshold:10, price:85,   supplier:"MedPhil Supply"  },
  { id:"ITM-007", barcode:"8850002003456", name:"Paracetamol 500mg",       category:"Medicine", unit:"box",    stock:24, threshold:15, price:45,   supplier:"MedPhil Supply"  },
  { id:"ITM-008", barcode:"8850002004567", name:"Amoxicillin-Clav 625mg",  category:"Medicine", unit:"box",    stock:6,  threshold:8,  price:185,  supplier:"MedPhil Supply"  },
  { id:"ITM-009", barcode:"8850003001234", name:"Alcohol 70% 500mL",       category:"Supplies", unit:"bottle", stock:18, threshold:10, price:75,   supplier:"MedSupplies Co." },
  { id:"ITM-010", barcode:"8850003002345", name:"Disposable Gloves (M)",   category:"Supplies", unit:"box",    stock:4,  threshold:5,  price:220,  supplier:"MedSupplies Co." },
  { id:"ITM-011", barcode:"8850003003456", name:"Surgical Mask (50pcs)",   category:"Supplies", unit:"box",    stock:9,  threshold:5,  price:165,  supplier:"MedSupplies Co." },
  { id:"ITM-012", barcode:"8850003004567", name:"Cotton Balls (100pcs)",   category:"Supplies", unit:"pack",   stock:11, threshold:8,  price:55,   supplier:"MedSupplies Co." },
]

const logs = [
  { id:1, itemId:"ITM-001", itemName:"Tretinoin 0.025% Cream", type:"out", qty:2, note:"Dispensed — Maria Cruz",   by:"Staff",  date:"Mar 23, 2026", time:"9:10 AM"  },
  { id:2, itemId:"ITM-005", itemName:"Amoxicillin 500mg",      type:"out", qty:1, note:"Dispensed — Carlo Santos", by:"Staff",  date:"Mar 23, 2026", time:"9:45 AM"  },
  { id:3, itemId:"ITM-007", itemName:"Paracetamol 500mg",      type:"in",  qty:10, note:"Restocked — MedPhil",     by:"Staff",  date:"Mar 22, 2026", time:"2:00 PM"  },
  { id:4, itemId:"ITM-003", itemName:"Hydroquinone 2% Cream",  type:"out", qty:1, note:"Dispensed — Grace Tan",    by:"Staff",  date:"Mar 21, 2026", time:"3:15 PM"  },
  { id:5, itemId:"ITM-009", itemName:"Alcohol 70% 500mL",      type:"in",  qty:6, note:"Restocked — MedSupplies",  by:"Staff",  date:"Mar 20, 2026", time:"10:00 AM" },
]

const CATEGORIES = ["All","Derma","Medicine","Supplies"]

const getStatus = (stock, threshold) => {
  if (stock===0)             return { label:"Out of Stock", color:"text-red-600",    bg:"bg-red-100",    border:"border-red-200",    bar:"bg-red-500",     pct:0 }
  if (stock<=threshold)      return { label:"Low Stock",    color:"text-amber-700",  bg:"bg-amber-50",   border:"border-amber-200",  bar:"bg-amber-400",   pct:Math.round((stock/threshold)*40) }
  return                            { label:"In Stock",     color:"text-emerald-700",bg:"bg-emerald-50", border:"border-emerald-200",bar:"bg-emerald-500", pct:Math.min(100,Math.round((stock/(threshold*3))*100)) }
}

const getCatStyle = cat => ({
  Derma:    { bg:"bg-purple-50", text:"text-purple-700", icon:MdScience          },
  Medicine: { bg:"bg-sky-50",    text:"text-sky-700",    icon:MdLocalPharmacy    },
  Supplies: { bg:"bg-slate-100", text:"text-slate-600",  icon:MdCleaningServices },
})[cat] || { bg:"bg-slate-100", text:"text-slate-600", icon:MdCategory }

const Admin_Inventory = () => {
  const [search,   setSearch]   = useState("")
  const [category, setCategory] = useState("All")
  const [tab,      setTab]      = useState("inventory")
  const [logFilter,setLogFilter]= useState("all")

  const lowStock   = items.filter(i=>i.stock<=i.threshold && i.stock>0)
  const outOfStock = items.filter(i=>i.stock===0)
  const totalValue = items.reduce((s,i)=>s+i.stock*i.price,0)

  const filtered = items.filter(i => {
    const matchCat = category==="All" || i.category===category
    const matchSrc = !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.barcode.includes(search) || i.supplier.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSrc
  })

  const filteredLogs = logs.filter(l => logFilter==="all" || l.type===logFilter)

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div><h1 className="text-2xl font-bold text-slate-800">Inventory</h1><p className="text-sm text-slate-500 mt-0.5">Admin view — read-only. Use Staff Inventory to make changes.</p></div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label:"Total Items",    value:items.length,                color:"text-slate-800",   bg:"bg-white"       },
          { label:"Inventory Value",value:`₱${totalValue.toLocaleString()}`, color:"text-slate-800", bg:"bg-white" },
          { label:"Low Stock",      value:lowStock.length,             color:"text-amber-600",   bg:"bg-amber-50"    },
          { label:"Out of Stock",   value:outOfStock.length,           color:"text-red-600",     bg:"bg-red-50"      },
        ].map(({label,value,color,bg})=>(
          <div key={label} className={`${bg} border border-slate-200 rounded-2xl px-5 py-4`}>
            <p className="text-xs text-slate-500 font-medium">{label}</p>
            <p className={`text-2xl font-black mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {outOfStock.length>0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex items-start gap-3">
          <MdWarning className="text-red-500 text-[18px] shrink-0 mt-0.5" />
          <div><p className="text-sm font-bold text-red-700">Out of Stock</p><p className="text-xs text-red-600 mt-0.5">{outOfStock.map(i=>i.name).join(", ")}</p></div>
        </div>
      )}
      {lowStock.length>0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-start gap-3">
          <MdTrendingDown className="text-amber-500 text-[18px] shrink-0 mt-0.5" />
          <div><p className="text-sm font-bold text-amber-700">Low Stock Warning</p><p className="text-xs text-amber-600 mt-0.5">{lowStock.map(i=>`${i.name} (${i.stock} left)`).join(" · ")}</p></div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
        {[{key:"inventory",label:"Stock List",icon:MdInventory2},{key:"logs",label:"Transaction Log",icon:MdHistory}].map(({key,label,icon:Icon})=>(
          <button key={key} onClick={()=>setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all
              ${tab===key ? "bg-[#0b1a2c] text-amber-400 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            <Icon className="text-[14px]" /> {label}
          </button>
        ))}
      </div>

      {tab==="inventory" && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-wrap">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex-1 min-w-52 focus-within:border-slate-300">
              <MdSearch className="text-slate-400 text-[15px] shrink-0" />
              <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, barcode, supplier…"
                className="text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none w-full" />
              {search && <button onClick={()=>setSearch("")} className="text-slate-300 hover:text-slate-500"><MdClose className="text-[13px]" /></button>}
            </div>
            <div className="flex gap-1">
              {CATEGORIES.map(c=>(
                <button key={c} onClick={()=>setCategory(c)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all
                    ${category===c ? "bg-[#0b1a2c] text-amber-400" : "text-slate-500 hover:bg-slate-100"}`}>{c}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[28px_2.5fr_1fr_1fr_1.2fr] gap-4 px-5 py-2.5 bg-slate-50 border-b border-slate-100">
            {["","Product","Category","Barcode","Stock Level"].map((h,i)=>(
              <p key={i} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h}</p>
            ))}
          </div>
          {filtered.map(item => {
            const status   = getStatus(item.stock, item.threshold)
            const catStyle = getCatStyle(item.category)
            const CatIcon  = catStyle.icon
            return (
              <div key={item.id} className="grid grid-cols-[28px_2.5fr_1fr_1fr_1.2fr] gap-4 px-5 py-4 items-center hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                <div className={`w-7 h-7 rounded-lg ${catStyle.bg} flex items-center justify-center shrink-0`}>
                  <CatIcon className={`text-[13px] ${catStyle.text}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5"><span className="font-mono">{item.id}</span> · {item.supplier}</p>
                </div>
                <span className={`text-[11px] font-bold border px-2.5 py-0.5 rounded-full w-fit ${catStyle.bg} ${catStyle.text}`}>
                  {item.category}
                </span>
                <p className="text-xs font-mono text-slate-400 truncate">{item.barcode}</p>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-bold ${item.stock===0?"text-red-600":item.stock<=item.threshold?"text-amber-600":"text-slate-800"}`}>
                      {item.stock} <span className="text-xs font-normal text-slate-400">{item.unit}s</span>
                    </span>
                    <span className={`text-[10px] font-bold border px-1.5 py-0.5 rounded-full ${status.bg} ${status.color} ${status.border}`}>{status.label}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${status.bar} rounded-full`} style={{width:`${Math.max(3,status.pct)}%`}} />
                  </div>
                  <p className="text-[10px] text-slate-400">Threshold: {item.threshold}</p>
                </div>
              </div>
            )
          })}
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
            <p className="text-[11px] text-slate-400">{filtered.length} of {items.length} items</p>
            <p className="text-[11px] text-slate-400">Filtered value: ₱{filtered.reduce((s,i)=>s+i.stock*i.price,0).toLocaleString()}</p>
          </div>
        </div>
      )}

      {tab==="logs" && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mr-1">Filter:</p>
            {[{key:"all",label:"All"},{key:"in",label:"Stock In"},{key:"out",label:"Stock Out"}].map(({key,label})=>(
              <button key={key} onClick={()=>setLogFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all
                  ${logFilter===key ? "bg-[#0b1a2c] text-amber-400" : "text-slate-500 hover:bg-slate-100"}`}>{label}</button>
            ))}
            <span className="ml-auto text-[11px] text-slate-400">{filteredLogs.length} records</span>
          </div>
          <div className="grid grid-cols-[90px_2fr_80px_60px_1.5fr_90px] gap-4 px-5 py-2.5 bg-slate-50 border-b border-slate-100">
            {["Date","Item","Type","Qty","Note","By"].map(h=>(
              <p key={h} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h}</p>
            ))}
          </div>
          <div className="divide-y divide-slate-100">
            {filteredLogs.map(log => (
              <div key={log.id} className="grid grid-cols-[90px_2fr_80px_60px_1.5fr_90px] gap-4 px-5 py-3.5 items-center hover:bg-slate-50 transition-colors">
                <div><p className="text-[11px] font-semibold text-slate-700">{log.date}</p><p className="text-[10px] text-slate-400 mt-0.5">{log.time}</p></div>
                <div><p className="text-sm font-semibold text-slate-800 truncate">{log.itemName}</p><p className="text-[10px] font-mono text-slate-400 mt-0.5">{log.itemId}</p></div>
                <span className={`flex items-center gap-1 text-[11px] font-bold border px-2 py-0.5 rounded-full w-fit
                  ${log.type==="in" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-500 border-red-200"}`}>
                  {log.type==="in" ? <MdArrowUpward className="text-[11px]" /> : <MdArrowDownward className="text-[11px]" />}
                  {log.type==="in" ? "In" : "Out"}
                </span>
                <p className="text-sm font-bold text-slate-700">{log.qty}</p>
                <p className="text-xs text-slate-500 truncate">{log.note}</p>
                <p className="text-[11px] text-slate-400">{log.by}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
export default Admin_Inventory