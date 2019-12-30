function select(table, selects = [], condition = {}) {
    let sql = 'SELECT ';
    if(typeof selects === "string") sql = sql.concat(selects+" ");
    else if(selects.length > 0){
        for(var i = 0; i < selects.length; i++){
            sql = sql.concat(selects[i]);
            if(i != selects.length -1) sql = sql.concat(',');
            sql = sql.concat(' ');
        }
    }
    else sql = sql.concat('* ');
    sql = sql.concat('FROM '+ table);
    for (const key in condition) {
        if (condition.hasOwnProperty(key)) {
            const element = condition[key];
            
        }
    }
    return sql;
  }

  console.log(select('transaction', 'id', { id : 'dds', asdf: 'fasdfsd'}))