'use strict'
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn,spawnSync}=require('node:child_process')
const root=path.resolve(__dirname,'../..'),out=__dirname
const base=fs.mkdtempSync(path.join(os.tmpdir(),'carait-qa-mysql-'))
const executable='C:/Program Files/MySQL/MySQL Server 8.0/bin/mysqld.exe'
const config=path.join(base,'my.ini'),data=path.join(base,'data')
fs.mkdirSync(data)
const dir=p=>p.replace(/\\/g,'/')
fs.writeFileSync(config,`[mysqld]\nbasedir=C:/Program Files/MySQL/MySQL Server 8.0\ndatadir=${dir(data)}\ninnodb_data_home_dir=${dir(data)}\ninnodb_undo_directory=${dir(data)}\ninnodb_log_group_home_dir=${dir(data)}\nport=33411\nbind-address=127.0.0.1\nmysqlx=OFF\nskip-log-bin\n`)
const initialized=spawnSync(executable,[`--defaults-file=${config}`,'--initialize-insecure','--console'],{cwd:base,encoding:'utf8',windowsHide:true,timeout:60000})
fs.writeFileSync(path.join(out,'mysql-isolated-init.log'),(initialized.stdout||'')+(initialized.stderr||''))
if(initialized.status!==0)throw Error('Disposable MySQL initialization failed; see redacted local log')
const stdout=fs.openSync(path.join(out,'mysql-isolated-start.log'),'w')
const child=spawn(executable,[`--defaults-file=${config}`,'--console'],{cwd:base,detached:true,windowsHide:true,stdio:['ignore',stdout,stdout]})
child.unref();fs.closeSync(stdout)
fs.writeFileSync(path.join(out,'mysql-instance.json'),JSON.stringify({pid:child.pid,base,data,port:33411,syntheticOnly:true},null,2))
console.log('Disposable MySQL launched on loopback port 33411, PID '+child.pid)
