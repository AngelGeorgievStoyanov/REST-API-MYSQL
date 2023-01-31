function parseError(error :any ){
    if(Array.isArray(error)){
        return error.map(e=>e.message).join('\n');
    }else if(error.name==='ValidationError'){
        return Object.values(error.errors).map(v =>v ).join('\n')
    }else{
        return error.message
    }
}

export default parseError
